import { describe, expect, it } from 'vitest'

import {
	normalizeQueryLimit,
	normalizeQueryOffsetPagination,
} from './pagination.js'

describe('normalizeQueryLimit', () => {
	it('keeps one optional positive safe page size', () => {
		expect(normalizeQueryLimit()).toBeUndefined()
		expect(normalizeQueryLimit(25)).toBe(25)
	})

	it('rejects invalid query limits', () => {
		expect(() => normalizeQueryLimit(0)).toThrow(
			new RangeError(
				'query.limit must be a safe integer greater than or equal to 1',
			),
		)
		expect(() => normalizeQueryLimit(1.5)).toThrow(RangeError)
		expect(() => normalizeQueryLimit(Number.MAX_SAFE_INTEGER + 1)).toThrow(
			RangeError,
		)
		expect(() => normalizeQueryLimit(Number.NaN)).toThrow(RangeError)
		expect(() => normalizeQueryLimit(Infinity)).toThrow(RangeError)
	})
})

describe('normalizeQueryOffsetPagination', () => {
	it('removes absent pagination and zero-only offsets', () => {
		expect(normalizeQueryOffsetPagination()).toBeUndefined()
		expect(normalizeQueryOffsetPagination({})).toBeUndefined()
		expect(normalizeQueryOffsetPagination({ offset: 0 })).toBeUndefined()
	})

	it('normalizes explicit offsets without mutating input', () => {
		const input = { offset: 50 }
		const pagination = normalizeQueryOffsetPagination(input)
		const offsetOnly = normalizeQueryOffsetPagination({ offset: 5 })

		expect(pagination).toStrictEqual({
			kind: 'offset-pagination',
			offset: 50,
		})
		expect(offsetOnly).toStrictEqual({
			kind: 'offset-pagination',
			offset: 5,
		})
		expect(input).toStrictEqual({ offset: 50 })
		expect(Object.isFrozen(pagination)).toBe(true)
	})

	it('rejects invalid offset pagination values', () => {
		expect(() => {
			// @ts-expect-error -- Runtime normalization protects JavaScript callers.
			normalizeQueryOffsetPagination(null)
		}).toThrow(new TypeError('offset pagination must be an object'))
		expect(() => normalizeQueryOffsetPagination({ offset: -1 })).toThrow(
			new RangeError(
				'pagination.offset must be a safe integer greater than or equal to 0',
			),
		)
		expect(() => normalizeQueryOffsetPagination({ offset: 0.5 })).toThrow(
			RangeError,
		)
	})
})
