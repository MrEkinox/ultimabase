import { expect, expectTypeOf, test } from 'vitest'

import {
	normalizeQueryCursorPagination,
	normalizeQueryLimit,
	normalizeQueryOffsetPagination,
	type QueryCursor,
	type QueryCursorPaginationNode,
	type QueryOffsetPaginationInput,
} from '../index.js'

test('keeps offset pagination input and output precise and readonly', () => {
	const input = { offset: 50 } as const satisfies QueryOffsetPaginationInput
	const pagination = normalizeQueryOffsetPagination(input)

	expect(input.offset).toBe(50)
	expectTypeOf(normalizeQueryLimit(25)).toEqualTypeOf<number | undefined>()
	expectTypeOf(pagination).toEqualTypeOf<
		| {
				readonly kind: 'offset-pagination'
				readonly offset: number
		  }
		| undefined
	>()

	// @ts-expect-error -- The limit remains an independent numeric clause.
	normalizeQueryLimit('25')
	// @ts-expect-error -- Offset pagination cannot redefine the query limit.
	normalizeQueryOffsetPagination({ limit: 25 })
	if (pagination !== undefined) {
		// @ts-expect-error -- Normalized pagination nodes are immutable.
		pagination.offset = 0
	}
})

test('brands normalized cursor tokens without burdening caller input', () => {
	const pagination = normalizeQueryCursorPagination({
		after: 'opaque.cursor',
	})

	expect(pagination.kind).toBe('cursor-pagination')
	expectTypeOf(pagination).toEqualTypeOf<QueryCursorPaginationNode>()
	expectTypeOf(pagination.after).toEqualTypeOf<QueryCursor | undefined>()
	expectTypeOf<'plain cursor'>().not.toExtend<QueryCursor>()

	// @ts-expect-error -- Cursor position cannot redefine the query limit.
	normalizeQueryCursorPagination({ after: 'opaque.cursor', limit: 25 })
	// @ts-expect-error -- Normalized cursor positions are immutable.
	pagination.after = undefined
})
