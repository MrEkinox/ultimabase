import { describe, expect, it } from 'vitest'

import { normalizeQueryOffsetPagination } from './pagination.js'

describe('normalizeQueryOffsetPagination', () => {
	it('removes absent pagination and zero-only offsets', () => {
		expect(normalizeQueryOffsetPagination()).toBeUndefined()
		expect(normalizeQueryOffsetPagination({})).toBeUndefined()
		expect(normalizeQueryOffsetPagination({ skip: 0 })).toBeUndefined()
	})

	it('normalizes explicit limit and skip combinations without mutating input', () => {
		const input = { limit: 25, skip: 50 }
		const pagination = normalizeQueryOffsetPagination(input)
		const limitOnly = normalizeQueryOffsetPagination({ limit: 10 })
		const skipOnly = normalizeQueryOffsetPagination({ skip: 5 })

		expect(pagination).toStrictEqual({
			kind: 'offset-pagination',
			limit: 25,
			skip: 50,
		})
		expect(limitOnly).toStrictEqual({
			kind: 'offset-pagination',
			limit: 10,
			skip: 0,
		})
		expect(skipOnly).toStrictEqual({
			kind: 'offset-pagination',
			limit: undefined,
			skip: 5,
		})
		expect(input).toStrictEqual({ limit: 25, skip: 50 })
		expect(Object.isFrozen(pagination)).toBe(true)
	})

	it('rejects invalid offset pagination values', () => {
		expect(() => {
			// @ts-expect-error -- Runtime normalization protects JavaScript callers.
			normalizeQueryOffsetPagination(null)
		}).toThrow(new TypeError('offset pagination must be an object'))
		expect(() => normalizeQueryOffsetPagination({ limit: 0 })).toThrow(
			new RangeError(
				'pagination.limit must be a safe integer greater than or equal to 1',
			),
		)
		expect(() => normalizeQueryOffsetPagination({ limit: 1.5 })).toThrow(
			RangeError,
		)
		expect(() =>
			normalizeQueryOffsetPagination({
				limit: Number.MAX_SAFE_INTEGER + 1,
			}),
		).toThrow(RangeError)
		expect(() => normalizeQueryOffsetPagination({ limit: Number.NaN })).toThrow(
			RangeError,
		)
		expect(() => normalizeQueryOffsetPagination({ limit: Infinity })).toThrow(
			RangeError,
		)
		expect(() => normalizeQueryOffsetPagination({ skip: -1 })).toThrow(
			new RangeError(
				'pagination.skip must be a safe integer greater than or equal to 0',
			),
		)
		expect(() => normalizeQueryOffsetPagination({ skip: 0.5 })).toThrow(
			RangeError,
		)
	})
})
