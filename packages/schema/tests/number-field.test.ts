import { describe, expect, it } from 'vitest'

import {
	defineFieldExtension,
	numberField,
	type FieldExtension,
} from '../src/index.js'

describe('numberField', () => {
	it('creates immutable integer metadata', () => {
		const source = {
			mode: 'integer',
			validation: {
				required: true,
				range: {
					min: -10,
					max: 10,
				},
				finite: true,
			},
			default: 0,
			immutable: true,
			indexed: 'unique',
			description: 'Signed score',
		} as const
		const field = numberField(source)

		expect(field).toStrictEqual({
			kind: 'number',
			options: source,
		})
		expect(field.options).not.toBe(source)
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
		expect(Object.isFrozen(field.options.validation)).toBe(true)
		expect(Object.isFrozen(field.options.validation.range)).toBe(true)
	})

	it('preserves floating-point constraints as declarative metadata', () => {
		const field = numberField({
			mode: 'float',
			validation: {
				range: {
					min: -1.5,
					max: 4.25,
				},
				finite: false,
			},
		})

		// Float mode still uses JavaScript number and does not imply decimal precision.
		expect(field.options).toStrictEqual({
			mode: 'float',
			validation: {
				range: {
					min: -1.5,
					max: 4.25,
				},
				finite: false,
			},
		})
	})

	it('copies caller-owned range metadata', () => {
		const source = {
			mode: 'integer' as const,
			validation: {
				range: {
					min: 1,
				},
			},
		}
		const field = numberField(source)

		source.validation.range.min = 2

		// Registered numeric constraints cannot change with caller-owned objects.
		expect(field.options.validation.range.min).toBe(1)
	})

	it('freezes validation metadata without a range constraint', () => {
		const field = numberField({
			mode: 'float',
			validation: {
				finite: true,
			},
		})

		// Value-only constraints do not require a synthetic range object.
		expect(field.options.validation).toStrictEqual({ finite: true })
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it('copies and freezes field extensions', () => {
		const extension = defineFieldExtension('fixture.unit', {
			name: 'meters',
		})
		const source: FieldExtension<string, object>[] = [extension]
		const field = numberField({
			mode: 'float',
			extensions: source,
		})

		source.push(defineFieldExtension('fixture.audit', { enabled: true }))

		expect(field.options.extensions).toStrictEqual([extension])
		expect(Object.isFrozen(field.options.extensions)).toBe(true)
	})

	it.each([
		[
			'fractional integer minimum',
			{ mode: 'integer', validation: { range: { min: 1.5 } } },
			'validation.range.min must be a safe integer in integer mode',
		],
		[
			'unsafe integer maximum',
			{
				mode: 'integer',
				validation: {
					range: { max: Number.MAX_SAFE_INTEGER + 1 },
				},
			},
			'validation.range.max must be a safe integer in integer mode',
		],
		[
			'infinite float minimum',
			{
				mode: 'float',
				validation: {
					range: { min: Number.NEGATIVE_INFINITY },
				},
			},
			'validation.range.min must be a finite number in float mode',
		],
		[
			'NaN float maximum',
			{
				mode: 'float',
				validation: {
					range: { max: Number.NaN },
				},
			},
			'validation.range.max must be a finite number in float mode',
		],
	] as const)('rejects an invalid %s boundary', (_name, options, message) => {
		// Boundary metadata must match the precision promised by its number mode.
		expect(() => numberField(options)).toThrow(new RangeError(message))
	})

	it.each(['integer', 'float'] as const)(
		'rejects an inverted %s range',
		(mode) => {
			expect(() =>
				numberField({
					mode,
					validation: {
						range: { min: 5, max: 4 },
					},
				}),
			).toThrow(
				new RangeError(
					'validation.range.min cannot be greater than validation.range.max',
				),
			)
		},
	)
})
