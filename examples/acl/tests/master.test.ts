import { ACL } from '@ultimabase/acl-permissions-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { hideNote, importNote, listPublicNotes } from '../src/admin.ts'
import { Member, Note } from '../src/schema.ts'
import { shareNote } from '../src/sharing.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('lets Master write complete ACLs and filter on them', async () => {
	await using t = await testApplication(ultimabase)
	const [ada, grace] = await t.asMaster(() =>
		Member.createMany({ data: [{ name: 'Ada' }, { name: 'Grace' }] }),
	)
	if (!ada || !grace) throw new TypeError('Missing members')
	const asAda = Member.pointer(ada.id)
	const asGrace = Member.pointer(grace.id)

	const welcome = await importNote('Welcome', ada.id)
	await t.as(asAda, () => Note.createOne({ data: { title: 'Private' } }))

	// The imported note is public; Ada still owns it.
	expect(await Note.findMany({ select: { title: true } })).toStrictEqual([
		{ id: welcome.id, title: 'Welcome' },
	])
	expect(await listPublicNotes()).toStrictEqual([
		{ id: welcome.id, title: 'Welcome' },
	])
	await t.as(asAda, () => shareNote(welcome.id, grace.id))

	// An empty ACL hides the row from everyone but Master.
	await hideNote(welcome.id)
	expect(await Note.findMany()).toStrictEqual([])
	expect(await t.as(asAda, () => Note.count())).toBe(1)
	expect(await t.as(asGrace, () => Note.count())).toBe(0)
	expect(await t.asMaster(() => Note.count())).toBe(2)
})

it('refuses to replace an ACL through an upsert, even for Master', async () => {
	await using t = await testApplication(ultimabase)
	const welcome = await t.asMaster(() =>
		Note.createOne({ data: { title: 'Welcome', acl: new ACL() } }),
	)

	await expect(
		t.asMaster(() =>
			Note.upsertOne({
				where: { id: { eq: welcome.id } },
				create: { title: 'Welcome' },
				update: { acl: new ACL().grantPublic('read') },
			}),
		),
	).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	expect(await Note.count()).toBe(0)
})
