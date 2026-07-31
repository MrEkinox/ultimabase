import { describe, expect, it } from 'vitest'

import { uuidField } from '../../index.js'

describe('uuidField', () => {
	it('creates frozen default metadata', () => {
		const field = uuidField()

		expect(field).toStrictEqual({
			kind: 'uuid',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('preserves UUID validation and common metadata', () => {
		const field = uuidField({
			validation: {
				required: true,
				version: 7,
			},
			default: '0198ff5f-51b2-7700-83c6-8f443674bb11',
			immutable: true,
			indexed: 'unique',
			description: 'External UUID',
		})

		// UUID constraints remain portable metadata for runtime validators.
		expect(field.options).toStrictEqual({
			validation: {
				required: true,
				version: 7,
			},
			default: '0198ff5f-51b2-7700-83c6-8f443674bb11',
			immutable: true,
			indexed: 'unique',
			description: 'External UUID',
		})
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it('freezes validation metadata without restricting the version', () => {
		const field = uuidField({
			validation: {
				nullable: true,
			},
		})

		expect(field.options.validation).toStrictEqual({ nullable: true })
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it.each([0, 9, 1.5, Number.NaN, '7', null] as const)(
		'rejects the invalid UUID version %s',
		(version) => {
			expect(() => {
				// @ts-expect-error -- Runtime validation protects untyped callers.
				uuidField({ validation: { version } })
			}).toThrow(
				new RangeError('validation.version must be an integer from 1 to 8'),
			)
		},
	)
})
