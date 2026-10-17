import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Article, Comment } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

// Comment and Article declare no Access rules, so only Master reaches them.
const master = { useMasterKey: true } as const

it('keeps native deletes permanent in command mode', async () => {
	await testApplication(ultimabase)
	const hidden = await Comment.createOne({ data: { body: 'Hide me' } }, master)
	const removed = await Comment.createOne(
		{ data: { body: 'Remove me' } },
		master,
	)

	await Comment.softDeleteOne({ id: hidden.id }, master)
	await Comment.deleteOne({ where: { id: removed.id } }, master)

	const all = { where: { isDeleted: { in: [true, false] } } }
	expect(await Comment.findMany(all, master)).toMatchObject([
		{ body: 'Hide me', isDeleted: true },
	])
	// Only the soft-deleted comment can come back.
	await expect(
		Comment.restoreOne({ id: removed.id }, master),
	).rejects.toMatchObject({ code: 'NOT_FOUND' })
	expect(
		await Comment.restoreOne(
			{ id: hidden.id, select: { isDeleted: true } },
			master,
		),
	).toMatchObject({ isDeleted: false })
})

it('releases a unique slug through the partial index', async () => {
	await testApplication(ultimabase)
	const first = await Article.createOne({ data: { slug: 'launch' } }, master)
	await Article.deleteOne({ where: { id: first.id } }, master)

	// The tombstone no longer holds the slug.
	await Article.createOne({ data: { slug: 'launch' } }, master)

	await expect(
		Article.restoreOne({ id: first.id }, master),
	).rejects.toMatchObject({
		code: 'UNIQUE_VIOLATION',
		publicMessage: `Cannot run restoreOne on Article ${first.id}: slug is now used by another row.`,
	})
})
