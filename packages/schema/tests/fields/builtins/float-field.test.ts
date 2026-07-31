import { describe, expect, it } from 'vitest'

import {
	defineFieldExtension,
	floatField,
	type FieldExtension,
} from '../../../src/index.js'

describe('floatField', () => {
	it('creates frozen default metadata', () => {
		const field = floatField()

		expect(field).toStrictEqual({
			kind: 'float',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('preserves floating-point constraints as declarative metadata', () => {
		const field = floatField({
			validation: {
				range: {
					min: -1.5,
					max: 4.25,
				},
				finite: false,
			},
		})

		// Float fields use JavaScript numbers without promising decimal precision.
		expect(field.options).toStrictEqual({
			validation: {
				range: {
					min: -1.5,
					max: 4.25,
				},
				finite: false,
			},
		})
		expect(Object.isFrozen(field.options.validation.range)).toBe(true)
	})

	it('freezes validation metadata without a range constraint', () => {
		const field = floatField({
			validation: {
				finite: true,
			},
		})

		expect(field.options.validation).toStrictEqual({ finite: true })
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it('copies and freezes field extensions', () => {
		const extension = defineFieldExtension('fixture.unit', {
			name: 'meters',
		})
		const source: FieldExtension<string, object>[] = [extension]
		const field = floatField({ extensions: source })

		source.push(defineFieldExtension('fixture.audit', { enabled: true }))

		expect(field.options.extensions).toStrictEqual([extension])
		expect(Object.isFrozen(field.options.extensions)).toBe(true)
	})

	it('rejects auto-increment metadata at runtime', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects untyped callers.
			floatField({ autoIncrement: true })
		}).toThrow(
			new TypeError('autoIncrement is only available on integer fields'),
		)
	})

	it.each([
		[
			'infinite minimum',
			{
				validation: {
					range: { min: Number.NEGATIVE_INFINITY },
				},
			},
		],
		[
			'NaN maximum',
			{
				validation: {
					range: { max: Number.NaN },
				},
			},
		],
	] as const)('rejects an invalid %s', (_name, options) => {
		// Range metadata must remain finite even when field values may be infinite.
		expect(() => floatField(options)).toThrow(
			/^validation\.range\.(?:min|max) must be a finite number$/u,
		)
	})

	it('rejects an inverted floating-point range', () => {
		expect(() =>
			floatField({
				validation: {
					range: { min: 5, max: 4 },
				},
			}),
		).toThrow(
			new RangeError(
				'validation.range.min cannot be greater than validation.range.max',
			),
		)
	})
})
