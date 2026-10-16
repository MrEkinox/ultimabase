import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { outbox } from '../src/effects.ts'
import { Post, PostTitleChange } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('records a title change in the same transaction', async () => {
	await using _t = await testApplication(ultimabase)
	const post = await Post.createOne({ data: { title: 'Draft title' } })

	//#region title-change
	await Post.updateOne({
		where: { id: { eq: post.id } },
		data: { title: 'Final title' },
	})

	const changes = await PostTitleChange.findMany({
		select: { previousTitle: true, title: true },
	})
	//#endregion title-change

	expect(changes).toMatchObject([
		{ previousTitle: 'Draft title', title: 'Final title' },
	])
})

it('rejects a published title change with a public error', async () => {
	await using t = await testApplication(ultimabase)
	const post = await Post.createOne({
		data: { title: 'Launch', published: true },
	})

	//#region public-error
	const rename = Post.updateOne({
		where: { id: { eq: post.id } },
		data: { title: 'Launch v2' },
	})
	//#endregion public-error

	await expect(rename).rejects.toMatchObject({
		code: 'post.published-title',
		message: 'A published post keeps its title.',
	})
	// Nothing was stored: neither the title nor its change row.
	expect(await Post.findOneOrThrow({ where: { id: post.id } })).toMatchObject({
		title: 'Launch',
	})
	expect(await PostTitleChange.count()).toBe(0)

	// REST answers 400 with the code and message.
	const response = await t.fetch(`/api/classes/Post/${post.id}`, {
		body: JSON.stringify({ title: 'Launch v2' }),
		headers: { 'content-type': 'application/json' },
		method: 'PATCH',
	})
	expect(response.status).toBe(400)
	expect(await response.json()).toMatchObject({
		error: {
			code: 'post.published-title',
			message: 'A published post keeps its title.',
		},
	})
})

it('rolls back Hook writes and events with their transaction', async () => {
	await using t = await testApplication(ultimabase)
	const post = await Post.createOne({ data: { title: 'Draft' } })
	await t.afterCommit()
	outbox.length = 0

	//#region rollback
	const publishThenCancel = ultimabase.transaction(async () => {
		await Post.updateOne({
			where: { id: { eq: post.id } },
			data: { title: 'Published', published: true },
		})
		throw new Error('Cancelled before commit')
	})
	//#endregion rollback

	await expect(publishThenCancel).rejects.toThrow('Cancelled before commit')
	await t.afterCommit()
	// The title change row and the queued event went with the transaction.
	expect(await PostTitleChange.count()).toBe(0)
	expect(await Post.findOneOrThrow({ where: { id: post.id } })).toMatchObject({
		published: false,
		title: 'Draft',
	})
	expect(outbox).toStrictEqual([])
})

it('runs the Hooks a compatible plugin contributes', async () => {
	await using _t = await testApplication(ultimabase)
	const post = await Post.createOne({
		data: { title: 'Live', published: true },
	})

	await expect(
		Post.deleteOne({ where: { id: post.id } }),
	).rejects.toMatchObject({ code: 'post.published-delete' })

	await Post.updateOne({
		where: { id: { eq: post.id } },
		data: { published: false },
	})
	expect(await Post.deleteOne({ where: { id: post.id } })).toMatchObject({
		title: 'Live',
	})
})
