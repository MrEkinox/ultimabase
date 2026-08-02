import { describe, expect, it } from 'vitest'

import { timeField } from '../../index.js'
import { requireDefined } from '../../../../tests/schema/test-assertions.js'

describe('timeField', () => {
	it('creates frozen metadata without an implicit timezone option', () => {
		const field = timeField()

		expect(field).toStrictEqual({
			kind: 'time',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('preserves a local time default and range', () => {
		const field = timeField({
			validation: {
				required: true,
				range: {
					min: '08:00:00.000',
					max: '18:00:00.000',
				},
			},
			default: '09:30:00.000',
		})

		expect(field.options).toStrictEqual({
			validation: {
				required: true,
				range: {
					min: '08:00:00.000',
					max: '18:00:00.000',
				},
			},
			default: '09:30:00.000',
		})
		expect(
			Object.isFrozen(
				requireDefined(
					field.options.validation?.range,
					'field.options.validation.range',
				),
			),
		).toBe(true)
	})

	it('supports zoned times and operation-clock generation', () => {
		const zoned = timeField({
			timezone: true,
			default: '09:30:00.000+02:00',
		})
		const generated = timeField({ autoNow: true })

		expect(zoned.options.default).toBe('09:30:00.000+02:00')
		expect(generated.options.autoNow).toBe(true)
	})

	it('copies time list defaults', () => {
		const source = ['09:30:00.000']
		const field = timeField({ list: true, default: source })

		source[0] = '10:30:00.000'

		expect(field.options.default).toStrictEqual(['09:30:00.000'])
		expect(Object.isFrozen(field.options.default)).toBe(true)
	})

	it.each([
		['maximum', { max: '18:00:00.000' }],
		['minimum', { min: '08:00:00.000' }],
	] as const)('supports a one-sided %s time range', (_name, range) => {
		const field = timeField({ validation: { range } })

		expect(field.options.validation?.range).toStrictEqual(range)
	})

	it('freezes presence validation without a time range', () => {
		const field = timeField({ validation: { nullable: true } })

		expect(field.options.validation).toStrictEqual({ nullable: true })
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it('rejects non-string values at the runtime boundary', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects untyped callers.
			timeField({ default: 9 })
		}).toThrow(
			new TypeError(
				'default must be a complete ISO time string without a timezone',
			),
		)
	})

	it('rejects an invalid timezone option at the runtime boundary', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects untyped callers.
			timeField({ timezone: 'UTC' })
		}).toThrow(new TypeError('timezone must be a boolean'))
	})

	it('rejects invalid operation-clock metadata at the runtime boundary', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects untyped callers.
			timeField({ autoNow: 'yes' })
		}).toThrow(new TypeError('autoNow must be a boolean'))
		expect(() => {
			// @ts-expect-error -- autoNow is mutually exclusive with default.
			timeField({ autoNow: true, default: '09:30:00.000' })
		}).toThrow(new TypeError('autoNow and default cannot both be configured'))
	})

	it.each([
		['former magic default', 'now'],
		['incomplete value', '09:30'],
		['invalid hour', '24:00:00.000'],
		['unexpected timezone', '09:30:00.000Z'],
	] as const)('rejects a local time with an %s', (_name, value) => {
		expect(() => timeField({ default: value })).toThrow(
			new RangeError(
				'default must be a complete ISO time string without a timezone',
			),
		)
	})

	it.each([
		['missing timezone', '09:30:00.000'],
		['invalid offset', '09:30:00.000+14:30'],
	] as const)('rejects a zoned time with an %s', (_name, value) => {
		expect(() => timeField({ timezone: true, default: value })).toThrow(
			new RangeError(
				'default must be a complete ISO time string with a timezone',
			),
		)
	})

	it('orders zoned ranges by their UTC-adjusted time', () => {
		const field = timeField({
			timezone: true,
			validation: {
				range: {
					min: '12:00:00.000+02:00',
					max: '10:30:00.000Z',
				},
			},
		})

		expect(field.options.validation?.range).toStrictEqual({
			min: '12:00:00.000+02:00',
			max: '10:30:00.000Z',
		})
	})

	it.each([
		[true, '12:00:00.000-01:00', '10:00:00.000Z'],
		[false, '18:00:00.000', '08:00:00.000'],
	] as const)('rejects an inverted time range', (timezone, min, max) => {
		expect(() =>
			timeField({
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
