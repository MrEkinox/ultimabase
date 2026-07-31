import { describe, expect, it } from 'vitest'

import { intField } from '../../index.js'

describe('intField', () => {
	it('creates frozen default metadata', () => {
		const field = intField()

		expect(field).toStrictEqual({
			kind: 'int',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('preserves integer constraints and common metadata', () => {
		const source = {
			validation: {
				required: true,
				range: {
					min: -10,
					max: 10,
				},
			},
			default: 0,
			immutable: true,
			indexed: 'unique',
			autoIncrement: true,
			description: 'Signed score',
		} as const
		const field = intField(source)

		expect(field).toStrictEqual({
			kind: 'int',
			options: source,
		})
		expect(field.options).not.toBe(source)
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
		expect(Object.isFrozen(field.options.validation)).toBe(true)
		expect(Object.isFrozen(field.options.validation.range)).toBe(true)
	})

	it('preserves an explicitly disabled integer sequence', () => {
		const field = intField({ autoIncrement: false })

		expect(field.options.autoIncrement).toBe(false)
	})

	it('copies caller-owned range metadata', () => {
		const source = {
			validation: {
				range: {
					min: 1,
				},
			},
		}
		const field = intField(source)

		source.validation.range.min = 2

		// Registered integer constraints cannot change with caller-owned objects.
		expect(field.options.validation.range.min).toBe(1)
	})

	it('freezes validation metadata without a range constraint', () => {
		const field = intField({
			validation: {
				required: true,
			},
		})

		expect(field.options.validation).toStrictEqual({ required: true })
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it.each([
		['fractional minimum', { validation: { range: { min: 1.5 } } }],
		[
			'unsafe maximum',
			{
				validation: {
					range: { max: Number.MAX_SAFE_INTEGER + 1 },
				},
			},
		],
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
		// Integer boundaries must preserve exact JavaScript safe-integer semantics.
		expect(() => intField(options)).toThrow(
			/^validation\.range\.(?:min|max) must be a safe integer$/u,
		)
	})

	it('rejects an inverted integer range', () => {
		expect(() =>
			intField({
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
