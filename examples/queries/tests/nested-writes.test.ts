import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import {
	createPostGraph,
	detachPost,
	revisePostGraph,
} from '../src/nested-writes.ts'
import { Author, Comment, Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { missingId } from './support.ts'

const bodies = (rows: readonly { readonly body: string }[]) =>
	rows.map(({ body }) => body).sort()

it('creates a post with its author and comments in one command', async () => {
	await testApplication(ultimabase)
	const existing = await Comment.createOne({ data: { body: 'Existing' } })

	const post = await createPostGraph(existing.id)

	expect(post.author).toMatchObject({ displayName: 'Ada' })
	expect(bodies(post.comments)).toStrictEqual(['Existing', 'First', 'Second'])
	expect(await Author.count()).toBe(1)
})

it('rolls the whole graph back when one link fails', async () => {
	await testApplication(ultimabase)

	await expect(createPostGraph(missingId)).rejects.toMatchObject({
		code: 'NOT_FOUND',
		publicDetails: { field: 'comments', schema: 'Comment' },
	})

	// Neither the post, its new author nor its new comments remain.
	expect(await Post.count()).toBe(0)
	expect(await Author.count()).toBe(0)
	expect(await Comment.count()).toBe(0)
})

it('updates the linked author and the comment memberships', async () => {
	await testApplication(ultimabase)
	const kept = await Comment.createOne({ data: { body: 'Kept' } })
	const created = await createPostGraph(kept.id)
	const [first, second] = created.comments.filter(({ body }) => body !== 'Kept')

	await revisePostGraph(created.id, first?.id ?? '', second?.id ?? '')

	const post = await Post.findOneOrThrow({
		where: { id: created.id },
		include: {
			author: { select: { displayName: true } },
			comments: { select: { body: true } },
		},
	})
	expect(post.author?.displayName).toBe('Ada Lovelace')
	expect(bodies(post.comments)).toStrictEqual(['Edited', 'Kept', 'Third'])
	// `disconnect` removes the membership, not the comment.
	expect(await Comment.exists({ where: { id: second?.id ?? '' } })).toBe(true)
})

it('replaces memberships with set and unlinks an optional pointer', async () => {
	await testApplication(ultimabase)
	const kept = await Comment.createOne({ data: { body: 'Kept' } })
	const created = await createPostGraph(kept.id)

	const detached = await detachPost(created.id, [kept.id])

	expect(detached?.author).toBeNull()
	expect(bodies(detached?.comments ?? [])).toStrictEqual(['Kept'])
	// Neither command deletes a target.
	expect(await Comment.count()).toBe(3)
	expect(await Author.count()).toBe(1)
	expect((await detachPost(created.id, []))?.comments).toStrictEqual([])
})
