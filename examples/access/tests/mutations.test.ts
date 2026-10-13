import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Story } from '../src/articles.ts'
import { AuditEntry, Note } from '../src/notes.ts'
import { Member, StaffRole } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

const denied = { code: 'PERMISSION_DENIED' }

it('updates unlocked stories and keeps a published title', async () => {
	await using t = await testApplication(ultimabase)
	const [draft, live, frozen] = await t.asMaster(() =>
		Story.createMany({
			data: [
				{ title: 'Draft' },
				{ published: true, title: 'Live' },
				{ locked: true, title: 'Frozen' },
			],
		}),
	)
	if (!draft || !live || !frozen) throw new TypeError('Missing stories')

	//#region update-story
	const retitled = await Story.updateOne({
		data: { title: 'Final draft' },
		where: { id: draft.id },
	})
	//#endregion update-story

	expect(retitled).toMatchObject({ title: 'Final draft' })
	// `item` refuses a new title on a published story, not other changes.
	await expect(
		Story.updateOne({ data: { title: 'Renamed' }, where: { id: live.id } }),
	).rejects.toMatchObject(denied)
	expect(
		await Story.updateOne({ data: { locked: true }, where: { id: live.id } }),
	).toMatchObject({ locked: true, title: 'Live' })
	// The `where` filter makes a locked story unreachable, like a missing one.
	expect(
		await Story.updateOne({
			data: { title: 'Thawed' },
			where: { id: frozen.id },
		}),
	).toBeNull()
	expect(
		await Story.findOneOrThrow({ where: { id: { eq: frozen.id } } }),
	).toMatchObject({ title: 'Frozen' })
})

it('keeps notes private to their author', async () => {
	await using t = await testApplication(ultimabase)
	const [ada, grace] = await t.asMaster(() =>
		Member.createMany({ data: [{ name: 'Ada' }, { name: 'Grace' }] }),
	)
	if (!ada || !grace) throw new TypeError('Missing members')
	const asAda = Member.pointer(ada.id)

	//#region write-note
	const note = await t.as(asAda, () =>
		Note.createOne({ data: { author: ada.id, body: 'Call the printer' } }),
	)
	const mine = await t.as(asAda, () => Note.findMany())
	const theirs = await t.as(Member.pointer(grace.id), () => Note.findMany())
	//#endregion write-note

	expect(mine).toMatchObject([{ body: 'Call the printer', id: note.id }])
	expect(theirs).toStrictEqual([])
	// Anonymous callers are refused, not shown an empty list.
	await expect(Note.findMany()).rejects.toMatchObject(denied)
	await expect(
		Note.createOne({ data: { author: ada.id, body: 'Forged' } }),
	).rejects.toMatchObject(denied)
	// `item` refuses a note written in another member's name.
	await expect(
		t.as(asAda, () =>
			Note.createOne({ data: { author: grace.id, body: 'Forged' } }),
		),
	).rejects.toMatchObject(denied)
	// Only the author updates a note, and never hands it to someone else.
	await expect(
		t.as(asAda, () =>
			Note.updateOne({ data: { author: grace.id }, where: { id: note.id } }),
		),
	).rejects.toMatchObject(denied)
	expect(
		await t.as(asAda, () =>
			Note.updateOne({ data: { body: 'Done' }, where: { id: note.id } }),
		),
	).toMatchObject({ body: 'Done' })
})

it('lets an admin delete any note by asking for its id alone', async () => {
	await using t = await testApplication(ultimabase)
	const [ada, root] = await t.asMaster(() =>
		Member.createMany({ data: [{ name: 'Ada' }, { name: 'Root' }] }),
	)
	if (!ada || !root) throw new TypeError('Missing members')
	await t.asMaster(() =>
		StaffRole.updateOne({
			data: { members: { connect: [Member.pointer(root.id)] } },
			where: { name: { eq: 'admin' } },
		}),
	)
	const note = await t.as(Member.pointer(ada.id), () =>
		Note.createOne({ data: { author: ada.id, body: 'Spam' } }),
	)
	const asRoot = Member.pointer(root.id)

	// The author is not an admin.
	await expect(
		t.as(Member.pointer(ada.id), () =>
			Note.deleteOne({ select: { id: true }, where: { id: note.id } }),
		),
	).rejects.toMatchObject(denied)
	// The admin cannot read Ada's note, so a full result is refused...
	await expect(
		t.as(asRoot, () => Note.deleteOne({ where: { id: note.id } })),
	).rejects.toMatchObject(denied)
	// ...and the identifier alone is allowed.
	expect(
		await t.as(asRoot, () =>
			Note.deleteOne({ select: { id: true }, where: { id: note.id } }),
		),
	).toStrictEqual({ id: note.id })
	expect(await t.asMaster(() => Note.count())).toBe(0)
})

it('writes audit entries that the caller cannot read back', async () => {
	await using t = await testApplication(ultimabase)

	//#region audit
	const entry = await AuditEntry.createOne({
		data: { action: 'login' },
		select: { id: true },
	})
	//#endregion audit

	expect(Object.keys(entry)).toStrictEqual(['id'])
	// Without `select: { id: true }` the result is unreadable: refused, and
	// nothing is written.
	await expect(
		AuditEntry.createOne({ data: { action: 'logout' } }),
	).rejects.toMatchObject(denied)
	expect(
		await t.asMaster(() => AuditEntry.findMany({ select: { action: true } })),
	).toStrictEqual([{ action: 'login', id: entry.id }])
})
