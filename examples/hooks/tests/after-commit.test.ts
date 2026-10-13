import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { outbox } from '../src/effects.ts'
import { Comment, Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('answers before afterCommit runs, then runs global Hooks first', async () => {
	await using t = await testApplication(ultimabase)
	outbox.length = 0

	//#region after-commit
	await Post.createOne({ data: { title: 'Fresh draft' } })
	const beforeDelivery = [...outbox]

	await t.afterCommit()
	//#endregion after-commit

	// The response did not wait for the network round trip.
	expect(beforeDelivery).toStrictEqual([])
	// Global Hooks, then the schema's own branch.
	expect(outbox).toStrictEqual([
		{ to: 'audit', subject: 'Post.create' },
		{ to: 'editors', subject: 'New draft: Fresh draft' },
	])
})

it('runs one afterCommit per row of a bulk call', async () => {
	await using t = await testApplication(ultimabase)
	outbox.length = 0

	await Post.createMany({ data: [{ title: 'One' }, { title: 'Two' }] })
	await t.afterCommit()

	expect(
		outbox.filter(({ to }) => to === 'editors').map(({ subject }) => subject),
	).toStrictEqual(['New draft: One', 'New draft: Two'])
})

it('delivers a typed event after the commit', async () => {
	await using t = await testApplication(ultimabase)
	const post = await Post.createOne({ data: { title: 'Launch' } })
	await t.afterCommit()
	outbox.length = 0

	//#region event
	await Post.updateOne({
		where: { id: { eq: post.id } },
		data: { published: true },
	})
	await t.afterCommit()
	//#endregion event

	expect(outbox).toContainEqual({
		to: 'subscribers',
		subject: 'New post: Launch',
	})
})

it('runs `all` for plugin commands with `kind` naming them', async () => {
	await using t = await testApplication(ultimabase)
	const comment = await Comment.createOne({ data: { body: 'Spam' } })
	await t.afterCommit()
	outbox.length = 0

	//#region command
	await Comment.softDeleteOne({ id: comment.id })
	await t.afterCommit()
	//#endregion command

	// The command runs its own branches, not the native `update` ones.
	expect(outbox).toStrictEqual([
		{ to: 'audit', subject: 'Comment.softDeleteOne' },
		{ to: 'moderators', subject: 'Hidden: Spam' },
	])
})
