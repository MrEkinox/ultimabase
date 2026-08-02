import { describe, expect, it } from 'vitest'

import { bigintField } from '../../index.js'
import { requireDefined } from '../../../../tests/schema/test-assertions.js'

describe('bigintField', () => {
	it('creates frozen default metadata', () => {
		const field = bigintField()

		expect(field).toStrictEqual({
			kind: 'bigint',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('preserves exact bigint constraints and common metadata', () => {
		const source = {
			validation: {
				required: true,
				range: {
					min: -9_000_000_000_000_000_000n,
					max: 9_000_000_000_000_000_000n,
				},
			},
			default: 0n,
			immutable: true,
			indexed: 'unique',
			autoIncrement: true,
			description: 'Exact ledger sequence',
		} as const
		const field = bigintField(source)
		const validation = requireDefined(
			field.options.validation,
			'field.options.validation',
		)
		const range = requireDefined(validation.range, 'validation.range')

		expect(field).toStrictEqual({
			kind: 'bigint',
			options: source,
		})
		expect(field.options).not.toBe(source)
		expect(Object.isFrozen(field.options)).toBe(true)
		expect(Object.isFrozen(validation)).toBe(true)
		expect(Object.isFrozen(range)).toBe(true)
	})

	it('preserves an explicitly disabled bigint sequence', () => {
		const field = bigintField({ autoIncrement: false })

		expect(field.options.autoIncrement).toBe(false)
	})

	it('copies caller-owned bigint range metadata', () => {
		const source = {
			validation: {
				range: {
					min: 1n,
				},
			},
		}
		const field = bigintField(source)
		const range = requireDefined(
			requireDefined(field.options.validation, 'field.options.validation')
				.range,
			'validation.range',
		)

		source.validation.range.min = 2n

		// Registered bigint constraints cannot change with caller-owned objects.
		expect(range.min).toBe(1n)
	})

	it('freezes validation metadata without a range constraint', () => {
		const field = bigintField({
			validation: {
				required: true,
			},
		})

		expect(field.options.validation).toStrictEqual({ required: true })
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it.each([1, '1', null] as const)(
		'rejects the non-bigint boundary %s',
		(min) => {
			expect(() => {
				// @ts-expect-error -- Runtime validation protects untyped callers.
				bigintField({ validation: { range: { min } } })
			}).toThrow(new RangeError('validation.range.min must be a bigint'))
		},
	)

	it('rejects an inverted bigint range', () => {
		expect(() =>
			bigintField({
				validation: {
					range: { min: 5n, max: 4n },
				},
			}),
		).toThrow(
			new RangeError(
				'validation.range.min cannot be greater than validation.range.max',
			),
		)
	})
})
