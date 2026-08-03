import { Schema, stringField } from '../../schema/index.js'
import { expect, expectTypeOf, test } from 'vitest'

import { normalizeQueryCursorOrdering } from './ordering.js'

const postSchema = Schema.define({
	className: 'Post',
	fields: {
		title: stringField(),
	},
})

test('preserves exact schema fields in stable cursor ordering', () => {
	const ordering = normalizeQueryCursorOrdering(postSchema, [
		{ field: 'title', direction: 'ascending' },
	])

	expect(ordering.kind).toBe('ordering')
	expectTypeOf<(typeof ordering.orders)[number]['field']>().toEqualTypeOf<
		'title' | 'id' | 'createdAt' | 'updatedAt'
	>()

	normalizeQueryCursorOrdering(postSchema, [
		// @ts-expect-error -- Cursor ordering cannot reference undeclared fields.
		{ field: 'missing', direction: 'ascending' },
	])
	// @ts-expect-error -- Stable ordering collections remain immutable.
	ordering.orders[0] = { kind: 'order', field: 'id', direction: 'ascending' }
})
