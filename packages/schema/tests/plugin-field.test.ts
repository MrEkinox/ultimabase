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

const snapshotValue = (value: unknown, path: string): string => {
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
			{ normalizeValidation, snapshotValue },
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

	it('uses flat validation by default and snapshots plugin normalization output', () => {
		const validation = { required: true }
		const field = definePluginField(
			'fixture.default-normalizer',
			{ validation },
			{ snapshotValue },
		)

		validation.required = false

		// Schema owns common metadata even when the plugin omits a custom normalizer.
		expect(field.options.validation.required).toBe(true)
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it.each(['', 'string', 'plugin'] as const)(
		'rejects the unavailable kind %s at runtime',
		(kind) => {
			expect(() => {
				// @ts-expect-error -- Runtime validation protects untyped plugin packages.
				definePluginField(kind, {}, { normalizeValidation, snapshotValue })
			}).toThrow()
		},
	)
})
