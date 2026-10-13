import { resolveRoleReference, rolesPlugin } from '@ultimabase/roles-plugin'
import { testApplication, type TestApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Administrator, Editor, Member, StaffRole } from '../src/schema.ts'
import { addStaffMember, includeAdministratorsInEditors } from '../src/staff.ts'
import { ultimabase } from '../src/ultimabase.ts'

/** Ada is an editor, Grace an administrator, so an editor too. */
const createStaff = async (t: TestApplication) => {
	const [ada, grace] = await t.asMaster(() =>
		Member.createMany({ data: [{ name: 'Ada' }, { name: 'Grace' }] }),
	)
	if (!ada || !grace) throw new TypeError('Missing members')
	await includeAdministratorsInEditors()
	await addStaffMember('editor', ada.id)
	await addStaffMember('administrator', grace.id)
	return { ada, grace }
}

it('answers for the current request or for a given member', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, grace } = await createStaff(t)

	//#region queries
	const roles = ultimabase.plugin(rolesPlugin)
	// Inside a request: the roles of its principal.
	const graceIsEditor = await t.as(Member.pointer(grace.id), () =>
		roles.has(Editor),
	)
	const graceRoles = await t.as(Member.pointer(grace.id), () =>
		roles.current(StaffRole),
	)
	// Anywhere on the server: the roles of a given member.
	const adaIsAdministrator = await roles.has(Administrator, {
		principal: Member.pointer(ada.id),
	})
	//#endregion queries

	expect(graceIsEditor).toBe(true)
	expect(graceRoles).toStrictEqual(['administrator', 'editor'])
	expect(adaIsAdministrator).toBe(false)
	// An anonymous request holds no role.
	expect(await t.as(undefined, () => roles.current(StaffRole))).toStrictEqual(
		[],
	)
	// Without `principal`, the queries need an active request.
	await expect(roles.has(Editor)).rejects.toMatchObject({
		code: 'MISSING_EXECUTION_CONTEXT',
	})
	// Master authority is not a membership.
	expect(await t.asMaster(() => roles.has(Editor))).toBe(false)
	expect(await t.asMaster(() => roles.current(StaffRole))).toStrictEqual([])
})

it('resolves membership once per request', async () => {
	await using t = await testApplication(ultimabase)
	const [ada] = await t.asMaster(() =>
		Member.createMany({ data: [{ name: 'Ada' }] }),
	)
	if (!ada) throw new TypeError('Missing member')
	const roles = ultimabase.plugin(rolesPlugin)

	//#region request-cache
	const asAda = Member.pointer(ada.id)
	const sameRequest = await t.as(asAda, async () => {
		const before = await roles.has(Editor)
		await addStaffMember('editor', ada.id)
		return { before, after: await roles.has(Editor) }
	})
	const nextRequest = await t.as(asAda, () => roles.has(Editor))
	//#endregion request-cache

	expect(sameRequest).toStrictEqual({ after: false, before: false })
	expect(nextRequest).toBe(true)
})

it('keeps a UUID reference across a rename', async () => {
	await using t = await testApplication(ultimabase)
	const { ada } = await createStaff(t)
	const roles = ultimabase.plugin(rolesPlugin)

	//#region references
	// A name reference performs no I/O; resolving it reads the stored role.
	const editor = await resolveRoleReference(Editor)
	const EditorById = StaffRole.role({ id: editor.id })

	await StaffRole.updateOne(
		{ where: { id: editor.id }, data: { name: 'Copy Editor' } },
		{ useMasterKey: true },
	)
	//#endregion references

	expect(editor).toMatchObject({ name: 'editor' })
	expect(await resolveRoleReference(EditorById)).toMatchObject({
		id: editor.id,
		name: 'copy editor',
	})
	// The name reference no longer matches a stored role.
	await expect(resolveRoleReference(Editor)).rejects.toMatchObject({
		code: 'ROLE_REFERENCE_UNKNOWN',
	})
	const principal = Member.pointer(ada.id)
	expect(await roles.has(EditorById, { principal })).toBe(true)
	expect(await roles.has(Editor, { principal })).toBe(false)
	// The object form always means a UUID; a name is never guessed to be one.
	expect(() => StaffRole.role({ id: 'editor' })).toThrow(
		'role id must be a UUID',
	)
})
