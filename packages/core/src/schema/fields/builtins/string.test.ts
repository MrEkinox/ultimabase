import { describe, expect, it } from 'vitest'

import { stringField } from '../../index.js'
import { requireDefined } from '../../../../tests/schema/test-assertions.js'

describe('stringField', () => {
	it('creates frozen default metadata', () => {
		const field = stringField()

		expect(field).toStrictEqual({
			kind: 'string',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('preserves declarative string constraints and common metadata', () => {
		const pattern = /^[a-z]+$/u
		const source = {
			validation: {
				required: true,
				length: {
					min: 2,
					max: 40,
				},
				match: pattern,
			},
			default: 'anonymous',
			immutable: true,
			indexed: 'unique',
			description: 'Public display name',
		} as const
		const field = stringField(source)
		const validation = requireDefined(
			field.options.validation,
			'field.options.validation',
		)

		// Constraints remain metadata so runtime plugins can compile one validation plan.
		expect(field.options).not.toBe(source)
		expect(field.options).toStrictEqual({
			validation: {
				required: true,
				length: {
					min: 2,
					max: 40,
				},
				match: pattern,
			},
			default: 'anonymous',
			immutable: true,
			indexed: 'unique',
			description: 'Public display name',
		})
		expect(Object.isFrozen(validation)).toBe(true)
		expect(
			Object.isFrozen(requireDefined(validation.length, 'validation.length')),
		).toBe(true)
		expect(validation.match).not.toBe(pattern)
		expect(
			Object.isFrozen(requireDefined(validation.match, 'validation.match')),
		).toBe(true)
	})

	it('copies caller-owned nested validation options', () => {
		const source = { validation: { length: { min: 2 } } }
		const field = stringField(source)

		source.validation.length.min = 3

		// Later caller mutations cannot change registered schema metadata.
		expect(field.options.validation?.length?.min).toBe(2)
	})

	it('freezes validation metadata without a length constraint', () => {
		const field = stringField({
			validation: {
				required: true,
			},
		})

		// Presence-only validation follows the same immutable boundary.
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it.each([
		[
			'negative minimum',
			{ validation: { length: { min: -1 } } },
			'validation.length.min must be a non-negative safe integer',
		],
		[
			'fractional maximum',
			{ validation: { length: { max: 1.5 } } },
			'validation.length.max must be a non-negative safe integer',
		],
		[
			'unsafe minimum',
			{
				validation: {
					length: { min: Number.MAX_SAFE_INTEGER + 1 },
				},
			},
			'validation.length.min must be a non-negative safe integer',
		],
		[
			'infinite maximum',
			{
				validation: {
					length: { max: Number.POSITIVE_INFINITY },
				},
			},
			'validation.length.max must be a non-negative safe integer',
		],
		[
			'NaN minimum',
			{ validation: { length: { min: Number.NaN } } },
			'validation.length.min must be a non-negative safe integer',
		],
	] as const)('rejects an invalid %s length', (_name, options, message) => {
		// Lengths must be portable integer metadata for every validation backend.
		expect(() => stringField(options)).toThrow(new RangeError(message))
	})

	it('rejects an inverted length range', () => {
		expect(() =>
			stringField({
				validation: {
					length: { min: 5, max: 4 },
				},
			}),
		).toThrow(
			new RangeError(
				'validation.length.min cannot be greater than validation.length.max',
			),
		)
	})
})
