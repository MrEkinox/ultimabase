import { ACL } from '@ultimabase/acl-permissions-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Member, Note } from '../src/schema.ts'
import { shareNote, unshareNote } from '../src/sharing.ts'
import { ultimabase } from '../src/ultimabase.ts'

// Each `//#region` below is shown on the ACL documentation page; the
// assertions after it prove what the page says about the result.

const denied = { code: 'PERMISSION_DENIED' }

const createMembers = async (
	t: Awaited<ReturnType<typeof testApplication>>,
) => {
	const [ada, grace, linus] = await t.asMaster(() =>
		Member.createMany({
			data: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Linus' }],
		}),
	)
	if (!ada || !grace || !linus) throw new TypeError('Missing members')
	return {
		ada: Member.pointer(ada.id),
		grace: Member.pointer(grace.id),
		linus: Member.pointer(linus.id),
	}
}

it('keeps a new note private to its creator', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, grace } = await createMembers(t)

	//#region create-note
	const note = await t.as(ada, () =>
		Note.createOne({ data: { title: 'Groceries' } }),
	)
	const mine = await t.as(ada, () => Note.findMany())
	const theirs = await t.as(grace, () => Note.findMany())
	//#endregion create-note

	expect(mine).toMatchObject([{ id: note.id, title: 'Groceries' }])
	// The ACL narrows the read in the database: no error, no row.
	expect(theirs).toStrictEqual([])
	expect(await Note.findMany()).toStrictEqual([])
	// Without the update and delete rights, the row is out of reach.
	expect(
		await t.as(grace, () =>
			Note.updateOne({ data: { title: 'Mine now' }, where: { id: note.id } }),
		),
	).toBeNull()
	expect(
		await t.as(grace, () => Note.deleteOne({ where: { id: note.id } })),
	).toBeNull()
	// Access, not the ACL, decides who creates: anonymous callers are refused.
	await expect(
		Note.createOne({ data: { title: 'Anonymous' } }),
	).rejects.toMatchObject(denied)
	// `new ACL(principal)` gave the creator read, update and delete.
	const stored = await t.asMaster(() =>
		Note.findOneOrThrow({ where: { id: note.id }, select: { acl: true } }),
	)
	expect(stored.acl.permissionsForPrincipal(ada)).toStrictEqual([
		'read',
		'update',
		'delete',
	])
	expect(
		await t.as(ada, () => Note.deleteOne({ where: { id: note.id } })),
	).toMatchObject({ id: note.id })
})

it('shares and unshares a note atomically', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, grace } = await createMembers(t)
	const note = await t.as(ada, () =>
		Note.createOne({ data: { title: 'Plans' } }),
	)
	const graceReads = () =>
		t.as(grace, () => Note.findOne({ where: { id: note.id } }))

	expect(await graceReads()).toBeNull()
	await t.as(ada, () => shareNote(note.id, grace.id))
	expect(await graceReads()).toMatchObject({ title: 'Plans' })
	// Reading does not allow updating: Grace holds `read` only.
	expect(
		await t.as(grace, () =>
			Note.updateOne({ data: { title: 'Edited' }, where: { id: note.id } }),
		),
	).toBeNull()
	await t.as(ada, () => unshareNote(note.id, grace.id))
	expect(await graceReads()).toBeNull()

	// Concurrent shares apply to the locked row: none overwrites another.
	const { linus } = await createMembers(t)
	await t.as(ada, () =>
		Promise.all([shareNote(note.id, grace.id), shareNote(note.id, linus.id)]),
	)
	const { acl } = await t.asMaster(() =>
		Note.findOneOrThrow({ where: { id: note.id }, select: { acl: true } }),
	)
	expect(acl.permissionsForPrincipal(grace)).toStrictEqual(['read'])
	expect(acl.permissionsForPrincipal(linus)).toStrictEqual(['read'])
})

it('revokes every right, or only the listed ones', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, grace } = await createMembers(t)
	const note = await t.as(ada, () =>
		Note.createOne({ data: { title: 'Budget' } }),
	)
	const rightsOf = async (member: typeof grace) =>
		(
			await t.asMaster(() =>
				Note.findOneOrThrow({ where: { id: note.id }, select: { acl: true } }),
			)
		).acl.permissionsForPrincipal(member)

	await t.asMaster(() =>
		Note.updateOne({
			where: { id: note.id },
			data: {
				acl: { grant: { principal: grace, permissions: ['read', 'write'] } },
			},
		}),
	)
	expect(await rightsOf(grace)).toStrictEqual(['read', 'update', 'delete'])
	await t.asMaster(() =>
		Note.updateOne({
			where: { id: note.id },
			data: { acl: { revoke: { principal: grace, permissions: ['delete'] } } },
		}),
	)
	expect(await rightsOf(grace)).toStrictEqual(['read', 'update'])
	await t.as(ada, () => unshareNote(note.id, grace.id))
	expect(await rightsOf(grace)).toStrictEqual([])
})

it('lets clients share only what clientSharing allows', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, grace, linus } = await createMembers(t)
	const note = await t.as(ada, () =>
		Note.createOne({ data: { title: 'Roadmap' } }),
	)
	await t.as(ada, () => shareNote(note.id, grace.id))

	// Grace reads the note but may not update it, so she may not share it.
	await expect(
		t.as(grace, () => shareNote(note.id, linus.id)),
	).rejects.toMatchObject(denied)
	// Linus cannot read the note: for him it does not exist.
	expect(await t.as(linus, () => shareNote(note.id, grace.id))).toBeNull()

	// Grace may update now, but still never grants a right she does not hold.
	await t.asMaster(() =>
		Note.updateOne({
			where: { id: note.id },
			data: { acl: { grant: { principal: grace, permissions: ['update'] } } },
		}),
	)
	await expect(
		t.as(grace, () =>
			Note.updateOne({
				where: { id: note.id },
				data: {
					acl: { grant: { principal: linus, permissions: ['delete'] } },
				},
			}),
		),
	).rejects.toMatchObject(denied)
	expect(await t.as(grace, () => shareNote(note.id, linus.id))).toMatchObject({
		id: note.id,
	})

	// Replacing the complete ACL stays reserved to Master.
	await expect(
		t.as(ada, () =>
			Note.updateOne({
				where: { id: note.id },
				data: { acl: new ACL().grantPublic('read') },
			}),
		),
	).rejects.toMatchObject(denied)
	await expect(
		t.as(ada, () =>
			Note.createOne({ data: { title: 'Mine', acl: new ACL(ada) } }),
		),
	).rejects.toMatchObject(denied)
})

it('shows the ACL to the members who may share the note', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, grace } = await createMembers(t)
	const note = await t.as(ada, () =>
		Note.createOne({ data: { title: 'Trip' } }),
	)
	await t.as(ada, () => shareNote(note.id, grace.id))

	//#region select-acl
	const { acl } = await t.as(ada, () =>
		Note.findOneOrThrow({ where: { id: note.id }, select: { acl: true } }),
	)
	//#endregion select-acl

	expect(acl.hasPrincipalPermission(grace, 'read')).toBe(true)
	// The `acl` field is not part of ordinary results.
	const plain = await t.as(ada, () =>
		Note.findOneOrThrow({ where: { id: note.id } }),
	)
	expect(Object.keys(plain)).not.toContain('acl')
	// Grace reads the note but `clientSharing` refuses her: the read fails.
	await expect(
		t.as(grace, () =>
			Note.findOne({ where: { id: note.id }, select: { acl: true } }),
		),
	).rejects.toMatchObject(denied)
})

it('limits how many members share one note', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, grace, linus } = await createMembers(t)
	const note = await t.as(ada, () =>
		Note.createOne({ data: { title: 'Party' } }),
	)
	await t.as(ada, () => shareNote(note.id, grace.id))
	await t.as(ada, () => shareNote(note.id, linus.id))
	// A repeated grant for one member counts once.
	await t.as(ada, () => shareNote(note.id, linus.id))
	const [extra] = await t.asMaster(() =>
		Member.createMany({ data: [{ name: 'Margaret' }] }),
	)
	if (!extra) throw new TypeError('Missing member')

	// `maxPrincipals: 3` binds Master too: size validation is never bypassed.
	await expect(
		t.asMaster(() => shareNote(note.id, extra.id)),
	).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
})
