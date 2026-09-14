import { expectTypeOf, test } from 'vitest'

import type { QueryBuilder } from '@ultimabase/core'
import type { readPostsWithContext } from './fixtures/querying/includes.js'
import type { readPublishedPosts } from './fixtures/querying/overview.js'
import type { readPostSignals } from './fixtures/querying/selections.js'
import { Post } from './fixtures/querying/schemas.js'

test('protects selection and terminal result inference', () => {
	type PublishedPost = Awaited<ReturnType<typeof readPublishedPosts>>[number]
	const post = {} as PublishedPost

	expectTypeOf(post.id).toEqualTypeOf<string>()
	expectTypeOf(post.createdAt).toEqualTypeOf<string>()
	expectTypeOf(post.title).toEqualTypeOf<string>()
	// @ts-expect-error -- Unselected fields are absent from the model surface.
	void post.internalNote

	type Signals = Awaited<ReturnType<typeof readPostSignals>>
	expectTypeOf<Signals[1]>().toEqualTypeOf<number>()
	expectTypeOf<Signals[2]>().toEqualTypeOf<boolean>()
})

test('protects exact pointer and relation inclusion results', () => {
	type IncludedPost = Awaited<ReturnType<typeof readPostsWithContext>>[number]
	const post = {} as IncludedPost

	expectTypeOf(post.comments[0]?.body).toEqualTypeOf<string | undefined>()
	if (post.author !== null) {
		expectTypeOf(post.author.name).toEqualTypeOf<string>()
		// @ts-expect-error -- Nested selections omit unrequested target fields.
		void post.author.active
	}
})

test('rejects unsupported operators, pointer filters, and Core cursors', () => {
	void Post.findMany({
		where: {
			published: {
				// @ts-expect-error -- Booleans do not expose string containment operators.
				contains: 'true',
			},
		},
	})

	void Post.findMany({
		include: {
			author: {
				// @ts-expect-error -- A pointer inclusion shapes output but cannot filter it.
				where: { active: { eq: true } },
			},
		},
	})

	expectTypeOf<
		Extract<'after', keyof QueryBuilder<typeof Post>>
	>().toEqualTypeOf<never>()
})
