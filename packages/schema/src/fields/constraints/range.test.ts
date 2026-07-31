import { describe, expect, it } from 'vitest'

import { normalizeOrderedRange } from './range.js'

const normalizeNumber = (value: number, path: string): number => {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${path} must be finite`)
	}

	return Math.trunc(value)
}

const compareNumbers = (left: number, right: number): number => left - right

describe('ordered range normalization', () => {
	it('copies and freezes valid partial and complete ranges', () => {
		const source = { min: 1.5, max: 3.5 }
		const range = normalizeOrderedRange(
			source,
			'validation.range',
			normalizeNumber,
			compareNumbers,
		)

		source.min = 2

		expect(range).toStrictEqual({ min: 1, max: 3 })
		expect(Object.isFrozen(range)).toBe(true)
		expect(
			normalizeOrderedRange(
				{ min: 1 },
				'validation.range',
				normalizeNumber,
				compareNumbers,
			),
		).toStrictEqual({ min: 1 })
	})

	it('rejects malformed, invalid, and reversed ranges', () => {
		expect(() =>
			normalizeOrderedRange(
				null as unknown as { min?: number },
				'validation.range',
				normalizeNumber,
				compareNumbers,
			),
		).toThrow(new TypeError('validation.range must be an object'))
		expect(() =>
			normalizeOrderedRange(
				{ max: Number.POSITIVE_INFINITY },
				'validation.range',
				normalizeNumber,
				compareNumbers,
			),
		).toThrow(new RangeError('validation.range.max must be finite'))
		expect(() =>
			normalizeOrderedRange(
				{ min: 3, max: 1 },
				'validation.range',
				normalizeNumber,
				compareNumbers,
			),
		).toThrow(
			new RangeError(
				'validation.range.min cannot be greater than validation.range.max',
			),
		)
	})
})
