import { Schema } from '../../schema/index.js'
import { expect, expectTypeOf, test } from 'vitest'

import { normalizeQueryOrdering } from './ordering.js'

const postSchema = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string(),
	}),
})

test('correlates ordering fields and directions with the schema', () => {
	const ordering = normalizeQueryOrdering(postSchema, [
		{ field: 'title', direction: 'ascending' },
		{ field: 'createdAt', direction: 'descending' },
	])

	expect(ordering.kind).toBe('ordering')
	expectTypeOf<(typeof ordering.orders)[number]['field']>().toEqualTypeOf<
		'title' | 'id' | 'createdAt' | 'updatedAt'
	>()
	expectTypeOf<(typeof ordering.orders)[number]['direction']>().toEqualTypeOf<
		'ascending' | 'descending'
	>()

	normalizeQueryOrdering(postSchema, [
		// @ts-expect-error -- Unknown fields cannot become normalized order nodes.
		{ field: 'missing', direction: 'ascending' },
	])
	normalizeQueryOrdering(postSchema, [
		// @ts-expect-error -- Directions are a closed transport-neutral vocabulary.
		{ field: 'title', direction: 'sideways' },
	])
	// @ts-expect-error -- Normalized order collections are immutable.
	ordering.orders[0] = {
		kind: 'order',
		field: 'title',
		direction: 'ascending',
	}
})
