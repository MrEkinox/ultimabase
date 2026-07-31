import { describe, expect, it } from 'vitest'

import { decimalField } from '../../index.js'

describe('decimalField', () => {
	it('creates frozen default metadata', () => {
		const field = decimalField()

		expect(field).toStrictEqual({
			kind: 'decimal',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('preserves exact decimal constraints and common metadata', () => {
		const field = decimalField({
			validation: {
				required: true,
				precision: 12,
				scale: 2,
				range: {
					min: '-9999999999.99',
					max: '9999999999.99',
				},
			},
			default: '19.99',
			indexed: true,
		})

		expect(field.options).toStrictEqual({
			validation: {
				required: true,
				precision: 12,
				scale: 2,
				range: {
					min: '-9999999999.99',
					max: '9999999999.99',
				},
			},
			default: '19.99',
			indexed: true,
		})
		expect(Object.isFrozen(field.options.validation)).toBe(true)
		expect(Object.isFrozen(field.options.validation.range)).toBe(true)
	})

	it('copies exact decimal list defaults', () => {
		const source = ['1.25', '2.50']
		const field = decimalField({ list: true, default: source })

		source[0] = '9.99'

		expect(field.options.default).toStrictEqual(['1.25', '2.50'])
		expect(Object.isFrozen(field.options.default)).toBe(true)
	})

	it.each([
		['maximum', { max: '999999999999999999999999999999.99' }],
		['minimum', { min: '-999999999999999999999999999999.99' }],
	] as const)('supports a one-sided %s range', (_name, range) => {
		const field = decimalField({ validation: { range } })

		expect(field.options.validation.range).toStrictEqual(range)
	})

	it('freezes digit validation without a decimal range', () => {
		const field = decimalField({
			validation: {
				precision: 10,
				scale: 4,
			},
		})

		expect(field.options.validation).toStrictEqual({
			precision: 10,
			scale: 4,
		})
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it('orders values exactly beyond JavaScript number precision', () => {
		const field = decimalField({
			validation: {
				range: {
					min: '9007199254740993.001',
					max: '9007199254740993.01',
				},
			},
		})

		expect(field.options.validation.range).toStrictEqual({
			min: '9007199254740993.001',
			max: '9007199254740993.01',
		})
	})

	it('treats equivalent scales as equal range boundaries', () => {
		const field = decimalField({
			validation: {
				range: {
					min: '1.0',
					max: '1.000',
				},
			},
		})

		expect(field.options.validation.range).toStrictEqual({
			min: '1.0',
			max: '1.000',
		})
	})

	it('rejects non-string values at the runtime boundary', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects untyped callers.
			decimalField({ default: 19.99 })
		}).toThrow(new TypeError('default must be an exact decimal string'))
	})

	it.each([
		[
			'exponent notation',
			'1e3',
			'default must be a valid exact decimal string',
		],
		[
			'explicit plus sign',
			'+1.25',
			'default must be a valid exact decimal string',
		],
		['leading zero', '01.25', 'default must be a valid exact decimal string'],
		['missing integer', '.25', 'default must be a valid exact decimal string'],
		['missing fraction', '1.', 'default must be a valid exact decimal string'],
		[
			'negative zero',
			'-0.00',
			'default must not use a negative zero representation',
		],
	] as const)('rejects %s', (_name, value, message) => {
		expect(() => decimalField({ default: value })).toThrow(
			new RangeError(message),
		)
	})

	it.each([
		['zero precision', { precision: 0 }, 'precision', 'positive'],
		['fractional precision', { precision: 1.5 }, 'precision', 'positive'],
		['negative scale', { scale: -1 }, 'scale', 'non-negative'],
		['fractional scale', { scale: 1.5 }, 'scale', 'non-negative'],
	] as const)('rejects %s', (_name, validation, path, expectation) => {
		expect(() => decimalField({ validation })).toThrow(
			new RangeError(
				`validation.${path} must be a ${expectation} safe integer`,
			),
		)
	})

	it('rejects a scale greater than precision', () => {
		expect(() =>
			decimalField({ validation: { precision: 2, scale: 3 } }),
		).toThrow(
			new RangeError(
				'validation.scale cannot be greater than validation.precision',
			),
		)
	})

	it('rejects an invalid decimal range boundary', () => {
		expect(() =>
			decimalField({ validation: { range: { min: 'not-a-decimal' } } }),
		).toThrow(
			new RangeError(
				'validation.range.min must be a valid exact decimal string',
			),
		)
	})

	it.each([
		['2', '1.999'],
		['-1.999', '-2'],
	] as const)('rejects the inverted range %s to %s', (min, max) => {
		expect(() => decimalField({ validation: { range: { min, max } } })).toThrow(
			new RangeError(
				'validation.range.min cannot be greater than validation.range.max',
			),
		)
	})
})
