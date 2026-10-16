import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Comment } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

const reply = (parentId: string | undefined, body: string) =>
	Comment.createOne({
		data: {
			body,
			...(parentId === undefined ? {} : { parent: { connect: parentId } }),
		},
	})

it('counts replies at every level through the same Hook', async () => {
	await using _t = await testApplication(ultimabase)
	//#region thread
	const root = await Comment.createOne({ data: { body: 'Root' } })
	const answer = await Comment.createOne({
		data: { body: 'Answer', parent: { connect: root.id } },
	})
	await Comment.createOne({
		data: { body: 'Thanks', parent: { connect: answer.id } },
	})
	//#endregion thread

	expect(
		await Comment.findMany({
			orderBy: { createdAt: 'asc' },
			select: { body: true, replies: true },
		}),
	).toMatchObject([
		{ body: 'Root', replies: 2 },
		{ body: 'Answer', replies: 1 },
		{ body: 'Thanks', replies: 0 },
	])
})

it('stops a chain deeper than 16 Hook-issued operations and rolls it back', async () => {
	await using _t = await testApplication(ultimabase)
	let parentId: string | undefined
	// Each new level makes its Hooks update every ancestor, one nested call each.
	for (let depth = 0; depth <= 16; depth += 1) {
		parentId = (await reply(parentId, `Level ${String(depth)}`)).id
	}

	const tooDeep = reply(parentId, 'Level 17')

	await expect(tooDeep).rejects.toMatchObject({
		code: 'RUNTIME_CALLBACK_RECURSION',
	})
	// The message shows the chain of schemas and operations.
	await expect(tooDeep).rejects.toThrow(
		'Comment.update-one -> Comment.update-one',
	)
	// The whole chain rolled back: no new comment, no counter moved.
	expect(await Comment.count()).toBe(17)
	expect(
		await Comment.findOneOrThrow({ where: { body: { eq: 'Level 0' } } }),
	).toMatchObject({ replies: 16 })
})
