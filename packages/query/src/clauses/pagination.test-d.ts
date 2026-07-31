import { expect, expectTypeOf, test } from 'vitest'

import {
	normalizeQueryCursorPagination,
	normalizeQueryOffsetPagination,
	type QueryCursor,
	type QueryCursorPaginationNode,
	type QueryOffsetPaginationInput,
} from '../index.js'

test('keeps offset pagination input and output precise and readonly', () => {
	const input = {
		limit: 25,
		skip: 50,
	} as const satisfies QueryOffsetPaginationInput
	const pagination = normalizeQueryOffsetPagination(input)

	expect(input.limit).toBe(25)
	expectTypeOf(pagination).toEqualTypeOf<
		| {
				readonly kind: 'offset-pagination'
				readonly limit: number | undefined
				readonly skip: number
		  }
		| undefined
	>()

	// @ts-expect-error -- Pagination values must be numeric before normalization.
	normalizeQueryOffsetPagination({ limit: '25' })
	if (pagination !== undefined) {
		// @ts-expect-error -- Normalized pagination nodes are immutable.
		pagination.skip = 0
	}
})

test('brands normalized cursor tokens without burdening caller input', () => {
	const pagination = normalizeQueryCursorPagination({
		after: 'opaque.cursor',
		limit: 25,
	})

	expect(pagination.kind).toBe('cursor-pagination')
	expectTypeOf(pagination).toEqualTypeOf<QueryCursorPaginationNode>()
	expectTypeOf(pagination.after).toEqualTypeOf<QueryCursor | undefined>()
	expectTypeOf<'plain cursor'>().not.toExtend<QueryCursor>()

	// @ts-expect-error -- Cursor pagination requires an explicit positive limit.
	normalizeQueryCursorPagination({ after: 'opaque.cursor' })
	// @ts-expect-error -- Normalized cursor pages are immutable.
	pagination.limit = 50
})
