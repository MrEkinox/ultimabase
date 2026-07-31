import { describe, expect, it } from 'vitest'
import { immutableRecord } from '@ultimabase/shared'

import {
	definePluginField,
	defineFieldExtension,
	type FieldValidationOptions,
} from '../src/index.js'

const normalizeValidation = (
	validation: FieldValidationOptions,
): Readonly<FieldValidationOptions> => immutableRecord(validation)

const normalizeValue = (value: unknown, path: string): string => {
	if (typeof value !== 'string') {
		throw new TypeError(`${path} must be a string`)
	}

	return value
}

describe('plugin fields', () => {
	it('reuses common immutable field metadata for namespaced kinds', () => {
		const extension = defineFieldExtension('fixture.trace', { enabled: true })
		const source = ['first']
		const field = definePluginField(
			'fixture.custom',
			{
				list: true,
				default: source,
				validation: { required: true },
				extensions: [extension],
			},
			{ normalizeValidation, normalizeValue },
		)

		source[0] = 'changed'

		expect(field).toStrictEqual({
			kind: 'fixture.custom',
			options: {
				list: true,
				default: ['first'],
				validation: { required: true },
				extensions: [extension],
			},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options.default)).toBe(true)
	})

	it.each(['', 'string', 'plugin'] as const)(
		'rejects the unavailable kind %s at runtime',
		(kind) => {
			expect(() => {
				// @ts-expect-error -- Runtime validation protects untyped plugin packages.
				definePluginField(kind, {}, { normalizeValidation, normalizeValue })
			}).toThrow()
		},
	)
})
