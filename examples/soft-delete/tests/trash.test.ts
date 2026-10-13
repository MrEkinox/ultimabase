import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import {
	addModerator,
	countAllPosts,
	emptyTrash,
	listLivePosts,
	listTrash,
} from '../src/admin.ts'
import { Member, Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

const createPosts = async () => {
	const live = await Post.createOne({ data: { title: 'Live' } })
	const older = await Post.createOne({ data: { title: 'Older' } })
	const newer = await Post.createOne({ data: { title: 'Newer' } })
	await Post.softDeleteOne({ id: older.id })
	await Post.softDeleteOne({ id: newer.id })
	return { live, newer, older }
}

it('shows the trash to moderators only', async () => {
	await using t = await testApplication(ultimabase)
	const { live, newer, older } = await createPosts()
	const member = await t.asMaster(() =>
		Member.createOne({ data: { name: 'Ada' } }),
	)
	const moderator = await t.asMaster(() =>
		Member.createOne({ data: { name: 'Grace' } }),
	)
	await addModerator(moderator.id)

	//#region read-deleted
	const readTrash = () =>
		Post.findMany({
			orderBy: { deletedAt: 'desc' },
			select: { title: true },
			where: { isDeleted: { eq: true } },
		})
	//#endregion read-deleted

	// Without `readDeleted`, the filter on `isDeleted` cannot reveal tombstones.
	expect(await readTrash()).toStrictEqual([])
	expect(await t.as(Member.pointer(member.id), readTrash)).toStrictEqual([])
	expect(await t.as(Member.pointer(moderator.id), readTrash)).toStrictEqual([
		{ id: newer.id, title: 'Newer' },
		{ id: older.id, title: 'Older' },
	])
	// A moderator's ordinary reads include tombstones too.
	expect(await t.as(Member.pointer(moderator.id), () => Post.count())).toBe(3)
	expect(await Post.count()).toBe(1)
	expect(await Post.findOne({ where: { id: { eq: live.id } } })).toMatchObject({
		title: 'Live',
	})
})

it('keeps the trash filter on Master reads unless they name isDeleted', async () => {
	await testApplication(ultimabase)
	const { newer, older } = await createPosts()

	expect(await listLivePosts()).toMatchObject([{ title: 'Live' }])
	expect(await listTrash()).toMatchObject([
		{ id: newer.id, title: 'Newer' },
		{ id: older.id, title: 'Older' },
	])
	expect(await countAllPosts()).toBe(3)
})

it('empties the trash from a server job', async () => {
	await testApplication(ultimabase)
	await createPosts()

	const purged = await emptyTrash(new Date(Date.now() + 60_000))

	expect(purged.map(({ title }) => title).sort()).toStrictEqual([
		'Newer',
		'Older',
	])
	expect(await countAllPosts()).toBe(1)
	expect(await emptyTrash(new Date(0))).toStrictEqual([])
})
