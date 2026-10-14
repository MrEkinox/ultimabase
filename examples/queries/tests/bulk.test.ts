import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import {
	createPostBatch,
	deletePostBatch,
	renamePostBatch,
	upsertPostBatch,
} from '../src/bulk.ts'
import { Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { missingId } from './support.ts'

it('runs ordered batches and returns one model per input', async () => {
	await testApplication(ultimabase)

	const created = await createPostBatch([
		{ slug: 'one', title: 'One' },
		{ slug: 'two', title: 'Two' },
	])
	const renamed = await renamePostBatch(
		created.map(({ id, title }) => ({ id, title: `${title}!` })),
	)
	const upserted = await upsertPostBatch([
		{ slug: 'two', title: 'Two again' },
		{ slug: 'three', title: 'Three' },
	])
	const deleted = await deletePostBatch(created.map(({ id }) => id))

	expect(created.map(({ slug }) => slug)).toStrictEqual(['one', 'two'])
	expect(renamed).toStrictEqual([
		{ id: created[0]?.id, title: 'One!' },
		{ id: created[1]?.id, title: 'Two!' },
	])
	expect(upserted.map(({ id }) => id)[0]).toBe(created[1]?.id)
	expect(upserted.map(({ title }) => title)).toStrictEqual([
		'Two again',
		'Three',
	])
	// Delete results are the rows before deletion, in input order.
	expect(deleted).toStrictEqual([
		{ id: created[0]?.id, slug: 'one', title: 'One!' },
		{ id: created[1]?.id, slug: 'two', title: 'Two again' },
	])
	expect(await Post.count()).toBe(1)
	expect(await createPostBatch([])).toStrictEqual([])
})

it('rolls back the whole batch when one item fails', async () => {
	await testApplication(ultimabase)
	const [post] = await createPostBatch([{ slug: 'one', title: 'One' }])

	await expect(
		renamePostBatch([
			{ id: post?.id ?? missingId, title: 'Renamed' },
			{ id: missingId, title: 'Missing' },
		]),
	).rejects.toMatchObject({ code: 'NOT_FOUND' })
	await expect(
		createPostBatch([
			{ slug: 'two', title: 'Two' },
			{ slug: 'one', title: 'Duplicate' },
		]),
	).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })

	expect(await Post.findMany({ select: { title: true } })).toStrictEqual([
		{ id: post?.id, title: 'One' },
	])
})
