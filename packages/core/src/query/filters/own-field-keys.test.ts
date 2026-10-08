import { describe, expect, it } from 'vitest'

import {
	createQueryStructuralFilter,
	createQueryValueFilter,
} from './factory.js'
import { fieldPath } from './target.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

// Regressions for object child-field maps keyed by developer names: plain
// reads (`fields[name]`) saw `Object.prototype` members, and plain assignment
// (`fields[name] = child`) lost a declared `__proto__` child field.

const protoField = '__proto__'

const OwnKeysFixture = UltimaBase.Schema.define({
	className: 'QueryFilterOwnKeysFixture',
	fields: (field) => ({
		metadata: field.object({
			fields: (field) => ({
				[protoField]: field.string(),
				label: field.string(),
			}),
		}),
	}),
})

describe('query object child fields keyed by developer names', () => {
	it('rejects inherited Object.prototype names as undeclared child fields', () => {
		for (const name of ['toString', 'constructor']) {
			expect(() =>
				createQueryStructuralFilter(OwnKeysFixture, 'contains', 'metadata', {
					[name]: 'value',
				}),
			).toThrow(
				new TypeError(`query filter value.${name} is not a declared field`),
			)
			expect(() =>
				createQueryValueFilter(
					OwnKeysFixture,
					'equal',
					fieldPath('metadata', [name]),
					'value',
				),
			).toThrow(
				new TypeError(
					`query field path references unknown object field "${name}" at index 0`,
				),
			)
		}
	})

	it('resolves a declared __proto__ child field', () => {
		const contains = createQueryStructuralFilter(
			OwnKeysFixture,
			'contains',
			'metadata',
			JSON.parse('{"__proto__":"value"}'),
		)

		expect(
			Object.getOwnPropertyDescriptor(contains.value, protoField)?.value,
		).toBe('value')
		expect(
			createQueryValueFilter(
				OwnKeysFixture,
				'equal',
				fieldPath('metadata', [protoField]),
				'value',
			),
		).toStrictEqual({
			field: 'metadata',
			kind: 'equal',
			path: [protoField],
			value: 'value',
		})
	})
})
