import { expect, expectTypeOf, test } from 'vitest'

import {
	normalizeQuerySkipPagination,
	normalizeQueryTake,
	type QueryPaginationNode,
	type QuerySkipPaginationInput,
} from '../index.js'

test('keeps skip pagination input and output precise and readonly', () => {
	const input = { skip: 50 } as const satisfies QuerySkipPaginationInput
	const pagination = normalizeQuerySkipPagination(input)

	expect(input.skip).toBe(50)
	expectTypeOf(normalizeQueryTake(25)).toEqualTypeOf<number | undefined>()
	expectTypeOf(pagination).toEqualTypeOf<
		| {
				readonly kind: 'skip-pagination'
				readonly skip: number
		  }
		| undefined
	>()

	// @ts-expect-error -- `take` remains an independent numeric clause.
	normalizeQueryTake('25')
	// @ts-expect-error -- Skip pagination cannot redefine the query `take`.
	normalizeQuerySkipPagination({ take: 25 })
	if (pagination !== undefined) {
		expectTypeOf(pagination).toEqualTypeOf<QueryPaginationNode>()
		// @ts-expect-error -- Normalized pagination nodes are immutable.
		pagination.skip = 0
	}
})
