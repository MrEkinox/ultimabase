import { describe, expect, it } from 'vitest'

import {
	normalizeQuerySkipPagination,
	normalizeQueryTake,
} from './pagination.js'

describe('normalizeQueryTake', () => {
	it('keeps one optional positive safe page size', () => {
		expect(normalizeQueryTake()).toBeUndefined()
		expect(normalizeQueryTake(25)).toBe(25)
	})

	it('rejects invalid query take values', () => {
		expect(() => normalizeQueryTake(0)).toThrow(
			new RangeError(
				'query.take must be a safe integer greater than or equal to 1',
			),
		)
		expect(() => normalizeQueryTake(1.5)).toThrow(RangeError)
		expect(() => normalizeQueryTake(Number.MAX_SAFE_INTEGER + 1)).toThrow(
			RangeError,
		)
		expect(() => normalizeQueryTake(Number.NaN)).toThrow(RangeError)
		expect(() => normalizeQueryTake(Infinity)).toThrow(RangeError)
	})
})

describe('normalizeQuerySkipPagination', () => {
	it('removes absent pagination and zero-only skips', () => {
		expect(normalizeQuerySkipPagination()).toBeUndefined()
		expect(normalizeQuerySkipPagination({})).toBeUndefined()
		expect(normalizeQuerySkipPagination({ skip: 0 })).toBeUndefined()
	})

	it('normalizes explicit skips without mutating input', () => {
		const input = { skip: 50 }
		const pagination = normalizeQuerySkipPagination(input)
		const skipOnly = normalizeQuerySkipPagination({ skip: 5 })

		expect(pagination).toStrictEqual({
			kind: 'skip-pagination',
			skip: 50,
		})
		expect(skipOnly).toStrictEqual({
			kind: 'skip-pagination',
			skip: 5,
		})
		expect(input).toStrictEqual({ skip: 50 })
		expect(Object.isFrozen(pagination)).toBe(true)
	})

	it('rejects invalid skip pagination values', () => {
		expect(() => {
			// @ts-expect-error -- Runtime normalization protects JavaScript callers.
			normalizeQuerySkipPagination(null)
		}).toThrow(new TypeError('skip pagination must be an object'))
		expect(() => normalizeQuerySkipPagination({ skip: -1 })).toThrow(
			new RangeError(
				'pagination.skip must be a safe integer greater than or equal to 0',
			),
		)
		expect(() => normalizeQuerySkipPagination({ skip: 0.5 })).toThrow(
			RangeError,
		)
	})
})
