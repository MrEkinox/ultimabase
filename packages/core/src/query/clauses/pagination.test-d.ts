import { expect, expectTypeOf, test } from 'vitest'

import {
	normalizeQueryLimit,
	normalizeQueryOffsetPagination,
	type QueryOffsetPaginationInput,
	type QueryPaginationNode,
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
		expectTypeOf(pagination).toEqualTypeOf<QueryPaginationNode>()
		// @ts-expect-error -- Normalized pagination nodes are immutable.
		pagination.offset = 0
	}
})
