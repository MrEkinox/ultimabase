import { rolesPlugin } from '@ultimabase/roles-plugin'
import { testApplication } from '@ultimabase/testing'
import { beforeEach, expect, it } from 'vitest'

import { roleAuditLog } from '../src/role-audit.ts'
import { Member, StaffRole, Team } from '../src/schema.ts'
import { addStaffMember, removeStaffMember } from '../src/staff.ts'
import { ultimabase } from '../src/ultimabase.ts'

const master = { useMasterKey: true } as const

beforeEach(() => {
	roleAuditLog.splice(0)
})

it('refuses to delete a staff role that still has members', async () => {
	await using t = await testApplication(ultimabase)
	const ada = await t.asMaster(() =>
		Member.createOne({ data: { name: 'Ada' } }),
	)
	await addStaffMember('editor', ada.id)
	await expect(
		StaffRole.deleteOne({ where: { name: 'editor' } }, master),
	).rejects.toMatchObject({ code: 'ROLE_DELETE_REFERENCED' })

	//#region delete-role
	// `fail`, the default policy: empty the role, then delete it.
	await removeStaffMember('editor', ada.id)
	const deleted = await StaffRole.deleteOne(
		{ where: { name: 'editor' }, select: { name: true } },
		{ useMasterKey: true },
	)
	//#endregion delete-role

	expect(deleted).toMatchObject({ name: 'editor' })
	// Each committed change reached the audit plugin once, after its commit;
	// the refused deletion rolled back and published nothing.
	await t.afterCommit()
	expect(roleAuditLog).toStrictEqual([
		`${deleted?.id ?? ''}: connect members ${ada.id}`,
		`${deleted?.id ?? ''}: disconnect members ${ada.id}`,
		`${deleted?.id ?? ''}: deleted (fail)`,
	])
})

it('deletes many roles in one transaction', async () => {
	await using t = await testApplication(ultimabase)
	const ada = await t.asMaster(() =>
		Member.createOne({ data: { name: 'Ada' } }),
	)
	await addStaffMember('editor', ada.id)
	const both = { where: [{ name: 'administrator' }, { name: 'editor' }] }

	// Editor still has a member: the whole collection rolls back.
	await expect(StaffRole.deleteMany(both, master)).rejects.toMatchObject({
		code: 'ROLE_DELETE_REFERENCED',
	})
	expect(await StaffRole.count()).toBe(2)
	await removeStaffMember('editor', ada.id)
	expect(await StaffRole.deleteMany(both, master)).toHaveLength(2)
})

it('clears the links of a cascading team, as Master only', async () => {
	await using t = await testApplication(ultimabase)
	const [ada, grace] = await t.asMaster(() =>
		Member.createMany({ data: [{ name: 'Ada' }, { name: 'Grace' }] }),
	)
	if (!ada || !grace) throw new TypeError('Missing members')
	await addStaffMember('administrator', grace.id)
	await t.asMaster(() =>
		Team.createOne({
			data: { name: 'Night desk', members: { connect: [ada.id] } },
		}),
	)
	// Team's rule lets Grace delete, but a cascade needs Master.
	await expect(
		t.as(Member.pointer(grace.id), () =>
			Team.deleteOne({ where: { name: 'night desk' } }),
		),
	).rejects.toMatchObject({ code: 'ROLE_DELETE_CASCADE_MASTER_REQUIRED' })

	//#region delete-team
	const removed = await Team.deleteOne(
		{ where: { name: 'night desk' }, select: { name: true } },
		{ useMasterKey: true },
	)
	//#endregion delete-team

	expect(removed).toMatchObject({ name: 'night desk' })
	expect(
		await t.as(Member.pointer(ada.id), () =>
			ultimabase.plugin(rolesPlugin).current(Team),
		),
	).toStrictEqual([])
	await t.afterCommit()
	expect(roleAuditLog.at(-1)).toBe(`${removed?.id ?? ''}: deleted (cascade)`)
})
