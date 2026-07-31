import { describe, expect, it } from 'vitest'

import {
	normalizeQueryCursorPagination,
	normalizeQueryOffsetPagination,
} from './pagination.js'

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

describe('normalizeQueryCursorPagination', () => {
	it('creates immutable first and subsequent forward pages', () => {
		const firstPage = normalizeQueryCursorPagination({ limit: 25 })
		const nextPage = normalizeQueryCursorPagination({
			after: 'opaque.cursor',
			limit: 25,
		})

		expect(firstPage).toStrictEqual({
			kind: 'cursor-pagination',
			after: undefined,
			limit: 25,
		})
		expect(nextPage).toStrictEqual({
			kind: 'cursor-pagination',
			after: 'opaque.cursor',
			limit: 25,
		})
		expect(Object.isFrozen(firstPage)).toBe(true)
		expect(Object.isFrozen(nextPage)).toBe(true)
	})

	it('rejects malformed cursor pagination at runtime', () => {
		expect(() => {
			// @ts-expect-error -- Runtime normalization protects JavaScript callers.
			normalizeQueryCursorPagination(null)
		}).toThrow(new TypeError('cursor pagination must be an object'))
		expect(() => {
			// @ts-expect-error -- Cursor pagination always requires a page size.
			normalizeQueryCursorPagination({})
		}).toThrow(
			new RangeError(
				'pagination.limit must be a safe integer greater than or equal to 1',
			),
		)
		expect(() =>
			normalizeQueryCursorPagination({ after: '', limit: 25 }),
		).toThrow(new TypeError('pagination.after must be a non-empty string'))
		expect(() => {
			// @ts-expect-error -- Runtime normalization validates cursor strings.
			normalizeQueryCursorPagination({ after: 42, limit: 25 })
		}).toThrow(new TypeError('pagination.after must be a non-empty string'))
	})
})
