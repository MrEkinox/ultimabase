import { Schema, intField, stringField } from '../../schema/index.js'
import { expect, expectTypeOf, test } from 'vitest'

import { Query, type QueryScope } from '../index.js'

const postSchema = Schema.define({
	className: 'Post',
	fields: {
		title: stringField(),
		views: intField(),
	},
})

test('preserves exact schema and projection through reusable scopes', () => {
	const popular: QueryScope<typeof postSchema> = (query) =>
		query.where((where) => where.gt('views', 100))
	const recentPopular: QueryScope<typeof postSchema> = (query) =>
		query.use(popular).descending('createdAt')
	const selected = new Query(postSchema)
		.select({ id: true, title: true })
		.use(recentPopular)

	expectTypeOf(selected).toEqualTypeOf<
		Query<typeof postSchema, 'id' | 'title'>
	>()

	const commentSchema = Schema.define({
		className: 'Comment',
		fields: { body: stringField() },
	})
	const comments: QueryScope<typeof commentSchema> = (query) =>
		query.where((where) => where.contains('body', 'typed'))

	expect(commentSchema.className).toBe('Comment')
	// @ts-expect-error -- Scopes cannot cross exact schema definitions.
	new Query(postSchema).use(comments)
	const selecting: QueryScope<typeof postSchema> = (query) =>
		// @ts-expect-error -- Scope outputs cannot silently widen the projection.
		query.select({ id: true })

	expectTypeOf(selecting).toBeFunction()
})
