import { defineSchema, intField, stringField } from '@ultimabase/schema'
import { expect, expectTypeOf, test } from 'vitest'

import { Query, type QueryScope } from '../index.js'

const postSchema = defineSchema({
	className: 'Post',
	fields: {
		title: stringField(),
		views: intField(),
	},
})

test('preserves exact schema and projection through reusable scopes', () => {
	const popular: QueryScope<typeof postSchema> = (query) =>
		query.greaterThan('views', 100)
	const recentPopular: QueryScope<typeof postSchema> = (query) =>
		query.use(popular).descending('createdAt')
	const selected = new Query(postSchema)
		.select('id', 'title')
		.use(recentPopular)

	expectTypeOf(selected).toEqualTypeOf<
		Query<typeof postSchema, 'id' | 'title'>
	>()

	const commentSchema = defineSchema({
		className: 'Comment',
		fields: { body: stringField() },
	})
	const comments: QueryScope<typeof commentSchema> = (query) =>
		query.contains('body', 'typed')

	expect(commentSchema.className).toBe('Comment')
	// @ts-expect-error -- Scopes cannot cross exact schema definitions.
	new Query(postSchema).use(comments)
	// @ts-expect-error -- Scope outputs cannot silently widen the projection.
	const selecting: QueryScope<typeof postSchema> = (query) => query.select('id')

	expectTypeOf(selecting).toBeFunction()
})
