import { describe, expect, it } from 'vitest'

import { dateTimeField } from '../src/index.js'

describe('dateTimeField', () => {
	it('creates frozen metadata with an implicit timezone', () => {
		const field = dateTimeField()

		expect(field).toStrictEqual({
			kind: 'dateTime',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('preserves a zoned date-time default and range', () => {
		const field = dateTimeField({
			timezone: true,
			validation: {
				required: true,
				range: {
					min: '2026-01-01T00:00:00.000Z',
					max: '2026-12-31T23:59:59.999Z',
				},
			},
			default: '2026-06-01T12:00:00.000+02:00',
		})

		expect(field.options).toStrictEqual({
			timezone: true,
			validation: {
				required: true,
				range: {
					min: '2026-01-01T00:00:00.000Z',
					max: '2026-12-31T23:59:59.999Z',
				},
			},
			default: '2026-06-01T12:00:00.000+02:00',
		})
		expect(Object.isFrozen(field.options.validation.range)).toBe(true)
	})

	it('supports local date-times and the operation-clock default', () => {
		const local = dateTimeField({
			timezone: false,
			default: '2026-06-01T12:00:00.000',
		})
		const generated = dateTimeField({ default: 'now' })

		expect(local.options.default).toBe('2026-06-01T12:00:00.000')
		expect(generated.options.default).toBe('now')
	})

	it('copies date-time list defaults', () => {
		const source = ['2026-06-01T12:00:00.000Z']
		const field = dateTimeField({ list: true, default: source })

		source[0] = '2030-06-01T12:00:00.000Z'

		expect(field.options.default).toStrictEqual(['2026-06-01T12:00:00.000Z'])
		expect(Object.isFrozen(field.options.default)).toBe(true)
	})

	it.each([
		['maximum', { max: '2026-12-31T23:59:59.999' }],
		['minimum', { min: '2026-01-01T00:00:00.000' }],
	] as const)('supports a one-sided local %s range', (_name, range) => {
		const field = dateTimeField({
			timezone: false,
			validation: { range },
		})

		expect(field.options.validation.range).toStrictEqual(range)
	})

	it('freezes presence validation without a date-time range', () => {
		const field = dateTimeField({ validation: { nullable: true } })

		expect(field.options.validation).toStrictEqual({ nullable: true })
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it('rejects non-string values at the runtime boundary', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects untyped callers.
			dateTimeField({ default: new Date() })
		}).toThrow(
			new TypeError(
				'default must be a complete ISO date-time string with a timezone',
			),
		)
	})

	it('rejects an invalid timezone option at the runtime boundary', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects untyped callers.
			dateTimeField({ timezone: 'UTC' })
		}).toThrow(new TypeError('timezone must be a boolean'))
	})

	it.each([
		['missing timezone', { default: '2026-01-01T00:00:00.000' }],
		['incomplete value', { default: '2026-01-01T00:00Z' }],
		['impossible day', { default: '2026-02-30T00:00:00.000Z' }],
		['invalid offset', { default: '2026-01-01T00:00:00.000+15:00' }],
	] as const)('rejects a zoned date-time with an %s', (_name, options) => {
		expect(() => dateTimeField(options)).toThrow(
			new RangeError(
				'default must be a complete ISO date-time string with a timezone',
			),
		)
	})

	it('rejects a timezone on a local date-time', () => {
		expect(() =>
			dateTimeField({
				timezone: false,
				default: '2026-01-01T00:00:00.000Z',
			}),
		).toThrow(
			new RangeError(
				'default must be a complete ISO date-time string without a timezone',
			),
		)
	})

	it('orders zoned ranges by their represented instant', () => {
		const field = dateTimeField({
			validation: {
				range: {
					min: '2026-01-01T12:00:00.000+02:00',
					max: '2026-01-01T10:30:00.000Z',
				},
			},
		})

		expect(field.options.validation.range).toStrictEqual({
			min: '2026-01-01T12:00:00.000+02:00',
			max: '2026-01-01T10:30:00.000Z',
		})
	})

	it.each([
		[true, '2026-01-01T12:00:00.000+01:00', '2026-01-01T10:00:00.000Z'],
		[false, '2026-12-31T00:00:00.000', '2026-01-01T00:00:00.000'],
	] as const)('rejects an inverted date-time range', (timezone, min, max) => {
		expect(() =>
			dateTimeField({
				timezone,
				validation: { range: { min, max } },
			}),
		).toThrow(
			new RangeError(
				'validation.range.min cannot be greater than validation.range.max',
			),
		)
	})
})
