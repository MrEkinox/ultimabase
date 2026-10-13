import { testApplication, type TestApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Comment } from '../src/comments.ts'
import { Member, StaffRole } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

const denied = { code: 'PERMISSION_DENIED' }

/** Creates a member, optionally in one role, and returns its principal. */
const member = async (t: TestApplication, name: string, role?: string) => {
	const { id } = await t.asMaster(() => Member.createOne({ data: { name } }))
	if (role !== undefined) {
		await t.asMaster(() =>
			StaffRole.updateOne({
				data: { members: { connect: [Member.pointer(id)] } },
				where: { name: { eq: role } },
			}),
		)
	}
	return Member.pointer(id)
}

it('lets authenticated members comment unless they are muted', async () => {
	await using t = await testApplication(ultimabase)
	const ada = await member(t, 'Ada')
	const troll = await member(t, 'Troll', 'muted')
	const comment = { author: ada.id, body: 'First!' }

	expect(
		await t.as(ada, () => Comment.createOne({ data: comment })),
	).toMatchObject({ body: 'First!' })
	await expect(Comment.createOne({ data: comment })).rejects.toMatchObject(
		denied,
	)
	await expect(
		t.as(troll, () => Comment.createOne({ data: comment })),
	).rejects.toMatchObject(denied)
})

it('rules plugin commands with their own keys', async () => {
	await using t = await testApplication(ultimabase)
	const ada = await member(t, 'Ada')
	const grace = await member(t, 'Grace', 'editor')
	const [first, pinned] = await t.asMaster(() =>
		Comment.createMany({
			data: [
				{ author: ada.id, body: 'Typo' },
				{ author: ada.id, body: 'Welcome', pinned: true },
			],
		}),
	)
	if (!first || !pinned) throw new TypeError('Missing comments')

	//#region hide-comment
	const hidden = await t.as(ada, () =>
		Comment.softDeleteOne({
			id: first.id,
			select: { isDeleted: true },
		}),
	)
	//#endregion hide-comment

	expect(hidden).toStrictEqual({ id: first.id, isDeleted: true })
	// `item` keeps pinned comments; the `where` filter keeps others' comments
	// out of reach, like missing rows.
	await expect(
		t.as(ada, () => Comment.softDeleteOne({ id: pinned.id })),
	).rejects.toMatchObject(denied)
	await expect(
		t.as(grace, () => Comment.softDeleteOne({ id: pinned.id })),
	).rejects.toMatchObject({ code: 'NOT_FOUND' })
	// Native `deleteOne` (a tombstone in this mode) keeps its own `delete`
	// key, which has no rule: the command's rule does not grant it.
	await expect(
		t.as(ada, () => Comment.deleteOne({ where: { id: pinned.id } })),
	).rejects.toMatchObject(denied)
	// `restoreOne` needs an editor or an admin; `restoreMany` has no rule.
	await expect(
		t.as(ada, () => Comment.restoreOne({ id: first.id })),
	).rejects.toMatchObject(denied)
	expect(
		await t.as(grace, () => Comment.restoreOne({ id: first.id })),
	).toMatchObject({ isDeleted: false })
	await expect(
		t.as(grace, () => Comment.restoreMany({ where: {} })),
	).rejects.toMatchObject(denied)
})

it('shows hidden comments to editors through readDeleted', async () => {
	await using t = await testApplication(ultimabase)
	const ada = await member(t, 'Ada')
	const grace = await member(t, 'Grace', 'editor')
	const comment = await t.asMaster(() =>
		Comment.createOne({ data: { author: ada.id, body: 'Typo' } }),
	)
	await t.as(ada, () => Comment.softDeleteOne({ id: comment.id }))

	const listHidden = () =>
		Comment.findMany({ where: { isDeleted: { eq: true } } })
	expect(await t.as(ada, listHidden)).toStrictEqual([])
	expect(await t.as(grace, listHidden)).toMatchObject([{ body: 'Typo' }])
})
