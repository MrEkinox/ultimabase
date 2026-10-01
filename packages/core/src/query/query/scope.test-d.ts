import { expect, expectTypeOf, test } from 'vitest'

import { QueryBuilder, type QueryScope } from '../index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const postSchema = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string(),
		views: field.int(),
	}),
})

test('preserves exact schema and projection through reusable scopes', () => {
	const popular: QueryScope<typeof postSchema> = (query) =>
		query.where((where) => where.gt('views', 100))
	const recentPopular: QueryScope<typeof postSchema> = (query) =>
		query.use(popular).descending('createdAt')
	const selected = new QueryBuilder(postSchema)
		.select({ id: true, title: true })
		.use(recentPopular)

	expectTypeOf(selected).toEqualTypeOf<
		QueryBuilder<typeof postSchema, 'id' | 'title'>
	>()

	const commentSchema = UltimaBase.Schema.define({
		className: 'Comment',
		fields: (field) => ({ body: field.string() }),
	})
	const comments: QueryScope<typeof commentSchema> = (query) =>
		query.where((where) => where.contains('body', 'typed'))

	expect(commentSchema.className).toBe('Comment')
	// @ts-expect-error -- Scopes cannot cross exact schema definitions.
	new QueryBuilder(postSchema).use(comments)
	const selecting: QueryScope<typeof postSchema> = (query) =>
		// @ts-expect-error -- Scope outputs cannot silently widen the projection.
		query.select({ id: true })

	expectTypeOf(selecting).toBeFunction()
})
