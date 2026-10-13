import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { countAllPosts } from '../src/admin.ts'
import { Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

// Each `//#region` below is shown on the Soft Delete documentation page; the
// assertions after it prove what the page says about the result.

it('soft-deletes a post and hides it from ordinary reads', async () => {
	await testApplication(ultimabase)
	//#region soft-delete
	const post = await Post.createOne({ data: { title: 'Draft announcement' } })

	// In the default mode, the native delete writes a tombstone.
	const deleted = await Post.deleteOne({
		where: { id: post.id },
		select: { title: true, isDeleted: true, deletedAt: true },
	})

	const visible = await Post.findOne({ where: { id: { eq: post.id } } })
	//#endregion soft-delete

	expect(deleted).toMatchObject({
		isDeleted: true,
		title: 'Draft announcement',
	})
	expect(deleted?.deletedAt).toEqual(expect.any(String))
	expect(visible).toBeNull()
	// A repeated deletion finds nothing, like an absent target.
	expect(await Post.deleteOne({ where: { id: post.id } })).toBeNull()
	await expect(Post.softDeleteOne({ id: post.id })).rejects.toMatchObject({
		code: 'NOT_FOUND',
	})
	// The row is still stored.
	expect(await countAllPosts()).toBe(1)
})

it('restores a tombstone with its data', async () => {
	await testApplication(ultimabase)
	const post = await Post.createOne({ data: { title: 'Draft announcement' } })
	await Post.softDeleteOne({ id: post.id })

	//#region restore
	const restored = await Post.restoreOne({
		id: post.id,
		select: { title: true, isDeleted: true, deletedAt: true },
	})
	//#endregion restore

	expect(restored).toStrictEqual({
		deletedAt: null,
		id: post.id,
		isDeleted: false,
		title: 'Draft announcement',
	})
	// Restore only sees tombstones: an active ID is not found.
	await expect(Post.restoreOne({ id: post.id })).rejects.toMatchObject({
		code: 'NOT_FOUND',
	})
})

it('purges a tombstone from trusted server code', async () => {
	await testApplication(ultimabase)
	const post = await Post.createOne({ data: { title: 'Draft announcement' } })

	//#region purge
	await Post.deleteOne({ where: { id: post.id } })

	const purged = await Post.purgeOne(
		{ id: post.id, select: { title: true, isDeleted: true } },
		{ useMasterKey: true },
	)
	//#endregion purge

	// The result is the record before its physical deletion.
	expect(purged).toStrictEqual({
		id: post.id,
		isDeleted: true,
		title: 'Draft announcement',
	})
	expect(await countAllPosts()).toBe(0)
	await expect(Post.restoreOne({ id: post.id })).rejects.toMatchObject({
		code: 'NOT_FOUND',
	})
	// Purge needs Master authority and reaches tombstones only.
	const live = await Post.createOne({ data: { title: 'Live' } })
	await expect(Post.purgeOne({ id: live.id })).rejects.toThrow()
	await expect(
		Post.purgeOne({ id: live.id }, { useMasterKey: true }),
	).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

it('soft-deletes, restores and purges many rows', async () => {
	await testApplication(ultimabase)
	await Post.createMany({
		data: [{ title: 'Draft one' }, { title: 'Draft two' }, { title: 'Final' }],
	})

	//#region many
	const hidden = await Post.softDeleteMany({
		where: { title: { startsWith: 'Draft' } },
		select: { deletedAt: true },
	})

	const back = await Post.restoreMany({
		where: { title: { startsWith: 'Draft' } },
	})

	await Post.softDeleteMany({ where: { title: { startsWith: 'Draft' } } })
	const removed = await Post.purgeMany(
		{ where: { title: { startsWith: 'Draft' } } },
		{ useMasterKey: true },
	)
	//#endregion many

	expect(hidden).toHaveLength(2)
	expect(back).toHaveLength(2)
	expect(removed).toHaveLength(2)
	// One result per written row, in identifier order.
	expect(removed.map(({ id }) => id)).toStrictEqual(hidden.map(({ id }) => id))
	expect(await countAllPosts()).toBe(1)
})
