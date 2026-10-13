import { rolesPlugin } from '@ultimabase/roles-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Member, StaffRole, Team } from '../src/schema.ts'
import {
	addStaffMember,
	includeAdministratorsInEditors,
	removeStaffMember,
} from '../src/staff.ts'
import { ultimabase } from '../src/ultimabase.ts'

const master = { useMasterKey: true } as const
const denied = { code: 'PERMISSION_DENIED' }

/** Ada and Grace, two members without any role yet. */
const createMembers = async () => {
	const [ada, grace] = await Member.createMany(
		{ data: [{ name: 'Ada' }, { name: 'Grace' }] },
		master,
	)
	if (!ada || !grace) throw new TypeError('Missing members')
	return { ada, grace }
}

it('creates the ensure roles at start', async () => {
	await using t = await testApplication(ultimabase)

	const roles = await StaffRole.findMany({
		orderBy: { name: 'asc' },
		select: { name: true },
	})
	expect(roles.map(({ name }) => name)).toStrictEqual([
		'administrator',
		'editor',
	])
	// Resetting the data runs the seeding again, like a restart.
	await t.reset()
	expect(await StaffRole.count()).toBe(2)
})

it('adds members and inherits through included roles', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, grace } = await createMembers()

	//#region membership
	await includeAdministratorsInEditors()
	await addStaffMember('editor', ada.id)
	await addStaffMember('administrator', grace.id)

	const roles = ultimabase.plugin(rolesPlugin)
	const adaRoles = await t.as(Member.pointer(ada.id), () =>
		roles.current(StaffRole),
	)
	const graceRoles = await t.as(Member.pointer(grace.id), () =>
		roles.current(StaffRole),
	)
	//#endregion membership

	expect(adaRoles).toStrictEqual(['editor'])
	// Grace is an administrator, and through Editor's included roles an editor.
	expect(graceRoles).toStrictEqual(['administrator', 'editor'])
	// Connecting the included role again changes nothing.
	await includeAdministratorsInEditors()
	expect(
		await StaffRole.findOneOrThrow({
			include: { includedRoles: { select: { name: true } } },
			where: { name: 'editor' },
		}),
	).toMatchObject({ includedRoles: [{ name: 'administrator' }] })
	await removeStaffMember('administrator', grace.id)
	expect(
		await t.as(Member.pointer(grace.id), () => roles.current(StaffRole)),
	).toStrictEqual([])
})

it('rejects a hierarchy cycle and writes nothing', async () => {
	await testApplication(ultimabase)
	await includeAdministratorsInEditors()
	const editor = await StaffRole.findOneOrThrow({ where: { name: 'editor' } })

	// Administrators are editors already: making editors administrators
	// would close a cycle.
	await expect(
		StaffRole.updateOne(
			{
				where: { name: 'administrator' },
				data: { includedRoles: { connect: [editor.id] } },
			},
			master,
		),
	).rejects.toMatchObject({ code: 'ROLE_HIERARCHY_CYCLE' })
	expect(
		await StaffRole.count({
			where: { name: 'administrator', includedRoles: { some: {} } },
		}),
	).toBe(0)
	// A role cannot include itself either.
	await expect(
		StaffRole.updateOne(
			{
				where: { name: 'editor' },
				data: { includedRoles: { connect: [editor.id] } },
			},
			master,
		),
	).rejects.toMatchObject({ code: 'ROLE_HIERARCHY_CYCLE' })
})

it('lets only Master change staff roles', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, grace } = await createMembers()
	await addStaffMember('administrator', grace.id)

	// StaffRole has no write rule: even an administrator is refused.
	await expect(
		t.as(Member.pointer(grace.id), () =>
			StaffRole.updateOne({
				where: { name: 'editor' },
				data: { members: { connect: [ada.id] } },
			}),
		),
	).rejects.toMatchObject(denied)
	await expect(
		t.as(Member.pointer(grace.id), () =>
			StaffRole.createOne({ data: { name: 'publisher' } }),
		),
	).rejects.toMatchObject(denied)
})

it('lets administrators manage teams under the Team rules', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, grace } = await createMembers()
	await addStaffMember('administrator', grace.id)

	//#region team
	const nightDesk = await t.as(Member.pointer(grace.id), () =>
		Team.createOne({
			data: { name: ' Night Desk ', members: { connect: [ada.id] } },
			select: { name: true },
		}),
	)
	//#endregion team

	// Names are stored trimmed, NFKC-normalized and lower-case.
	expect(nightDesk).toStrictEqual({ id: nightDesk.id, name: 'night desk' })
	expect(
		await t.as(Member.pointer(ada.id), () =>
			ultimabase.plugin(rolesPlugin).current(Team),
		),
	).toStrictEqual(['night desk'])
	// Names are unique in their role schema, after normalization.
	await expect(
		t.as(Member.pointer(grace.id), () =>
			Team.createOne({ data: { name: 'NIGHT DESK' } }),
		),
	).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
	// Ada is not an administrator.
	await expect(
		t.as(Member.pointer(ada.id), () =>
			Team.createOne({ data: { name: 'Sports' } }),
		),
	).rejects.toMatchObject(denied)
	// Every linked member must exist and be visible to the caller.
	await expect(
		t.as(Member.pointer(grace.id), () =>
			Team.updateOne({
				where: { id: nightDesk.id },
				data: {
					members: { connect: ['00000000-0000-4000-8000-000000000000'] },
				},
			}),
		),
	).rejects.toMatchObject({ code: 'NOT_FOUND' })
})
