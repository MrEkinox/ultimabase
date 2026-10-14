import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Author, Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import {
	clearSummary,
	createPost,
	deleteLoadedPost,
	deletePost,
	renamePost,
} from '../src/writes.ts'
import { createAuthor, missingId } from './support.ts'

it('creates a post connected to its author', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor()

	const post = await createPost(ada.id, 'hello', 'Hello')

	expect(post).toStrictEqual({
		id: post.id,
		published: false,
		slug: 'hello',
		title: 'Hello',
		author: { id: ada.id, displayName: ada.displayName },
	})
	// `connect` never creates a target: a missing one fails, and nothing is written.
	await expect(createPost(missingId, 'orphan', 'Orphan')).rejects.toMatchObject(
		{
			code: 'NOT_FOUND',
			publicDetails: { field: 'author', schema: 'Author' },
		},
	)
	expect(await Post.count()).toBe(1)
})

it('updates by id and returns null for an absent target', async () => {
	await testApplication(ultimabase)
	const post = await Post.createOne({
		data: { slug: 'draft', title: 'Draft', summary: 'Old summary' },
	})

	const renamed = await renamePost(post.id, 'Final')
	const cleared = await clearSummary(post.id)

	expect(renamed).toStrictEqual({ id: post.id, title: 'Final' })
	expect(cleared).toStrictEqual({ id: post.id, summary: null, editCount: 1 })
	expect(await clearSummary(post.id)).toMatchObject({ editCount: 2 })
	// The loaded result does not change.
	expect(post.title).toBe('Draft')
	expect(await renamePost(missingId, 'Nothing')).toBeNull()
	// A declared unique field is a target too.
	expect(
		await Post.updateOne({
			where: { slug: 'draft' },
			data: { views: { increment: 10 } },
			select: { views: true },
		}),
	).toStrictEqual({ id: post.id, views: 10 })
})

it('deletes and returns the row as it was', async () => {
	await testApplication(ultimabase)
	const post = await Post.createOne({ data: { slug: 'gone', title: 'Gone' } })

	const deleted = await deletePost(post.id)

	expect(deleted).toStrictEqual({ id: post.id, slug: 'gone', title: 'Gone' })
	expect(await Post.findOne({ where: { id: post.id } })).toBeNull()
	expect(await deletePost(post.id)).toBeNull()

	const loaded = await Post.createOne({
		data: { slug: 'loaded', title: 'Loaded' },
	})
	expect(await deleteLoadedPost(loaded.id)).toStrictEqual({
		id: loaded.id,
		title: 'Loaded',
	})
	await expect(deleteLoadedPost(loaded.id)).rejects.toMatchObject({
		code: 'NOT_FOUND',
	})
})

it('restricts deleting a referenced author', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor()
	await createPost(ada.id, 'kept', 'Kept')

	//#region restrict
	const attempt = Author.deleteOne({ where: { id: ada.id } })
	//#endregion restrict

	await expect(attempt).rejects.toMatchObject({
		code: 'REFERENCE_VIOLATION',
		publicDetails: { schema: 'Author' },
	})
	expect(await Author.count()).toBe(1)
})
