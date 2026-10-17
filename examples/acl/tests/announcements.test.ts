import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { addEditor, describeAnnouncementACL } from '../src/admin.ts'
import { Announcement, Member } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

const denied = { code: 'PERMISSION_DENIED' }

const createTeam = async (t: Awaited<ReturnType<typeof testApplication>>) => {
	const [editor, reader] = await t.asMaster(() =>
		Member.createMany({ data: [{ name: 'Ada' }, { name: 'Grace' }] }),
	)
	if (!editor || !reader) throw new TypeError('Missing members')
	await addEditor(editor.id)
	return {
		editor: Member.pointer(editor.id),
		reader: Member.pointer(reader.id),
	}
}

it('lets everyone read and editors change announcements', async () => {
	await using t = await testApplication(ultimabase)
	const { editor, reader } = await createTeam(t)

	//#region announce
	const launch = await t.as(editor, () =>
		Announcement.createOne({ data: { published: true, title: 'Launch' } }),
	)
	const seen = await Announcement.findMany({ select: { title: true } })
	const edited = await t.as(editor, () =>
		Announcement.updateOne({
			data: { title: 'Launch day' },
			where: { id: launch.id },
			select: { title: true },
		}),
	)
	//#endregion announce

	// The public entry lets anonymous callers read; the role entry lets
	// editors update.
	expect(seen).toStrictEqual([{ id: launch.id, title: 'Launch' }])
	expect(edited).toMatchObject({ title: 'Launch day' })
	// Access lets every caller run an update; the ACL keeps the row out of
	// reach for a member without the role.
	expect(
		await t.as(reader, () =>
			Announcement.updateOne({
				data: { title: 'Hijacked' },
				where: { id: launch.id },
			}),
		),
	).toBeNull()
	expect(
		await t.as(reader, () =>
			Announcement.deleteOne({ where: { id: launch.id } }),
		),
	).toBeNull()
	// Access, not the ACL, decides who creates.
	await expect(
		t.as(reader, () =>
			Announcement.createOne({ data: { published: true, title: 'Spam' } }),
		),
	).rejects.toMatchObject(denied)
	// Without clientSharing, only Master selects the ACL.
	await expect(
		t.as(editor, () =>
			Announcement.findMany({ select: { acl: true, title: true } }),
		),
	).rejects.toMatchObject(denied)
})

it('never lets the ACL widen an Access rule', async () => {
	await using t = await testApplication(ultimabase)
	const { editor } = await createTeam(t)
	await t.as(editor, () =>
		Announcement.createMany({
			data: [{ published: true, title: 'Live' }, { title: 'Draft' }],
			// The draft is unreadable: only identifiers come back.
			select: { id: true },
		}),
	)

	// The public read entry covers both rows; Access still hides the draft,
	// from editors too.
	expect(
		await Announcement.findMany({ select: { title: true } }),
	).toMatchObject([{ title: 'Live' }])
	expect(await t.as(editor, () => Announcement.count())).toBe(1)
	// Master bypasses both authorization policies.
	expect(await t.asMaster(() => Announcement.count())).toBe(2)
})

it('lists the entries of an ACL, roles by name', async () => {
	await using t = await testApplication(ultimabase)
	const { editor } = await createTeam(t)
	const launch = await t.as(editor, () =>
		Announcement.createOne({ data: { published: true, title: 'Launch' } }),
	)

	expect(await describeAnnouncementACL(launch.id)).toStrictEqual([
		'public: read',
		'role editors: update, delete',
	])
})
