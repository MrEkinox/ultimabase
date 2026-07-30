import { describe, expect, it } from 'vitest'

import { dateField } from '../src/index.js'

describe('dateField', () => {
	it('creates frozen default metadata', () => {
		const field = dateField()

		expect(field).toStrictEqual({
			kind: 'date',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('snapshots a static default and Date range', () => {
		const defaultValue = new Date('2026-06-01T12:00:00.000Z')
		const min = new Date('2026-01-01T00:00:00.000Z')
		const max = new Date('2026-12-31T23:59:59.999Z')
		const field = dateField({
			validation: {
				required: true,
				range: { min, max },
			},
			default: defaultValue,
			indexed: true,
		})

		expect(field.options.default).toEqual(defaultValue)
		expect(field.options.default).not.toBe(defaultValue)
		expect(field.options.validation.range.min).toEqual(min)
		expect(field.options.validation.range.min).not.toBe(min)
		expect(field.options.validation.range.max).toEqual(max)
		expect(field.options.validation.range.max).not.toBe(max)
		expect(Object.isFrozen(field.options.default)).toBe(true)
		expect(Object.isFrozen(field.options.validation)).toBe(true)
		expect(Object.isFrozen(field.options.validation.range)).toBe(true)
		expect(Object.isFrozen(field.options.validation.range.min)).toBe(true)
		expect(Object.isFrozen(field.options.validation.range.max)).toBe(true)
	})

	it('isolates metadata from caller-owned Date mutations', () => {
		const defaultValue = new Date('2026-06-01T12:00:00.000Z')
		const min = new Date('2026-01-01T00:00:00.000Z')
		const field = dateField({
			validation: {
				range: { min },
			},
			default: defaultValue,
		})

		defaultValue.setUTCFullYear(2030)
		min.setUTCFullYear(2030)

		// Date snapshots retain their original instants after caller mutation.
		expect(field.options.default.getUTCFullYear()).toBe(2026)
		expect(field.options.validation.range.min.getUTCFullYear()).toBe(2026)
	})

	it('freezes presence validation without a Date range', () => {
		const field = dateField({
			validation: {
				nullable: true,
			},
		})

		expect(field.options.validation).toStrictEqual({ nullable: true })
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it('supports a one-sided maximum Date range', () => {
		const max = new Date('2026-12-31T23:59:59.999Z')
		const field = dateField({
			validation: {
				range: { max },
			},
		})

		// Either boundary may be declared independently.
		expect(field.options.validation.range).toEqual({ max })
	})

	it('rejects non-Date values at the runtime boundary', () => {
		expect(() => {
			// JavaScript callers receive the same invariant enforced by TypeScript.
			// @ts-expect-error -- Runtime coverage intentionally crosses the public type boundary.
			dateField({ default: '2026-01-01T00:00:00.000Z' })
		}).toThrow(new TypeError('default must be a Date'))
	})

	it.each([
		['default', { default: new Date(Number.NaN) }, 'default'],
		[
			'minimum',
			{ validation: { range: { min: new Date(Number.NaN) } } },
			'validation.range.min',
		],
		[
			'maximum',
			{ validation: { range: { max: new Date(Number.NaN) } } },
			'validation.range.max',
		],
	] as const)('rejects an invalid %s Date', (_name, options, path) => {
		expect(() => dateField(options)).toThrow(
			new RangeError(`${path} must be a valid Date`),
		)
	})

	it('rejects an inverted Date range', () => {
		expect(() =>
			dateField({
				validation: {
					range: {
						min: new Date('2026-12-31T00:00:00.000Z'),
						max: new Date('2026-01-01T00:00:00.000Z'),
					},
				},
			}),
		).toThrow(
			new RangeError(
				'validation.range.min cannot be greater than validation.range.max',
			),
		)
	})
})
