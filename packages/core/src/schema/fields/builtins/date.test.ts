import { describe, expect, it } from 'vitest'

import { dateField } from '../../index.js'
import { requireDefined } from '../../../../tests/schema/test-assertions.js'

describe('dateField', () => {
	it('creates frozen calendar-day metadata', () => {
		const field = dateField()

		expect(field).toStrictEqual({
			kind: 'date',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('preserves a calendar-day default and range', () => {
		const field = dateField({
			validation: {
				required: true,
				range: {
					min: '2026-01-01',
					max: '2026-12-31',
				},
			},
			default: '2026-06-01',
			indexed: true,
		})

		expect(field.options).toStrictEqual({
			validation: {
				required: true,
				range: {
					min: '2026-01-01',
					max: '2026-12-31',
				},
			},
			default: '2026-06-01',
			indexed: true,
		})
		expect(Object.isFrozen(field.options.validation)).toBe(true)
		expect(
			Object.isFrozen(
				requireDefined(
					field.options.validation?.range,
					'field.options.validation.range',
				),
			),
		).toBe(true)
	})

	it('preserves operation-clock generation metadata', () => {
		const field = dateField({ autoNow: true })
		const disabled = dateField({ autoNow: false })

		expect(field.options).toStrictEqual({ autoNow: true })
		expect(disabled.options).toStrictEqual({ autoNow: false })
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('copies calendar-day list defaults', () => {
		const source = ['2026-06-01']
		const field = dateField({ list: true, default: source })

		source[0] = '2030-06-01'

		expect(field.options.default).toStrictEqual(['2026-06-01'])
		expect(Object.isFrozen(field.options.default)).toBe(true)
	})

	it('freezes presence validation without a date range', () => {
		const field = dateField({
			validation: {},
		})

		expect(field.options.validation).toStrictEqual({})
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it.each([
		['maximum', { max: '2026-12-31' }],
		['minimum', { min: '2026-01-01' }],
	] as const)('supports a one-sided %s date range', (_name, range) => {
		const field = dateField({ validation: { range } })

		// Either calendar-day boundary may be declared independently.
		expect(field.options.validation?.range).toEqual(range)
	})

	it('rejects non-string values at the runtime boundary', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects untyped callers.
			dateField({ default: new Date('2026-01-01T00:00:00.000Z') })
		}).toThrow(new TypeError('default must be a calendar date string'))
	})

	it('rejects ambiguous or listed operation-clock generation', () => {
		expect(() => {
			// @ts-expect-error -- autoNow is mutually exclusive with default.
			dateField({ autoNow: true, default: '2026-01-01' })
		}).toThrow(new TypeError('autoNow and default cannot both be configured'))
		expect(() => {
			// @ts-expect-error -- One operation clock cannot generate a list value.
			dateField({ autoNow: true, list: true })
		}).toThrow(new TypeError('autoNow cannot be used with list fields'))
	})

	it.each([
		['former magic default', { default: 'today' }, 'default'],
		['invalid default', { default: 'not-a-date' }, 'default'],
		['date-time default', { default: '2026-01-01T00:00:00.000Z' }, 'default'],
		['impossible day', { default: '2026-02-30' }, 'default'],
		[
			'invalid minimum',
			{ validation: { range: { min: 'not-a-date' } } },
			'validation.range.min',
		],
		[
			'invalid maximum',
			{ validation: { range: { max: 'not-a-date' } } },
			'validation.range.max',
		],
	] as const)('rejects an %s', (_name, options, path) => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally combines heterogeneous invalid options.
			dateField(options)
		}).toThrow(new RangeError(`${path} must be a valid calendar date string`))
	})

	it('rejects an inverted calendar-day range', () => {
		expect(() =>
			dateField({
				validation: {
					range: {
						min: '2026-12-31',
						max: '2026-01-01',
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
