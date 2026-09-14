import { expectTypeOf, test } from 'vitest'

import type { createPost } from './fixtures/mutations/create.js'
import type { deletePost } from './fixtures/mutations/delete.js'
import type { publishPost } from './fixtures/mutations/update.js'
import { Post } from './fixtures/mutations/schemas.js'

test('protects mutation selection and inclusion result inference', () => {
	type CreatedPost = Awaited<ReturnType<typeof createPost>>
	const created = {} as CreatedPost

	expectTypeOf<Extract<'slug', keyof CreatedPost>>().toEqualTypeOf<'slug'>()
	expectTypeOf<Extract<'title', keyof CreatedPost>>().toEqualTypeOf<'title'>()
	if (created.author !== null) {
		expectTypeOf(created.author.displayName).toEqualTypeOf<string>()
	}
	// @ts-expect-error -- Unselected root fields are absent.
	void created.views

	type UpdatedPost = Awaited<ReturnType<typeof publishPost>>
	expectTypeOf<UpdatedPost>().toExtend<{
		readonly title: string
		readonly views: number | null
	} | null>()

	type DeletedPost = Awaited<ReturnType<typeof deletePost>>
	expectTypeOf<DeletedPost>().toExtend<{
		readonly slug: string
		readonly title: string
	} | null>()
})

test('rejects nested writes on bulk roots and upserts', () => {
	void Post.createMany({
		data: [
			{
				// @ts-expect-error -- Bulk roots accept stored pointers, not nested commands.
				author: { create: { displayName: 'Ada', email: 'ada@example.com' } },
				slug: 'bulk',
				title: 'Bulk',
			},
		],
	})

	void Post.upsertOne({
		create: {
			// @ts-expect-error -- Upsert branches do not expose nested writes.
			author: { connect: '0199b38e-ef80-7000-8000-000000000001' },
			slug: 'upsert',
			title: 'Upsert',
		},
		update: { title: 'Upserted' },
		where: { slug: { eq: 'upsert' } },
	})
})
