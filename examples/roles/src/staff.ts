import { Member, StaffRole } from './schema.ts'

// Trusted server code: Master authority comes from the application's
// configured key, never from a client-selected `useMasterKey` flag.

//#region staff-admin
const master = { useMasterKey: true } as const

/** Adds a member to a staff role, named by its stored lower-case name. */
export const addStaffMember = (
	role: 'administrator' | 'editor',
	memberId: string,
) =>
	StaffRole.updateOne(
		{
			where: { name: role },
			data: { members: { connect: [Member.pointer(memberId)] } },
			select: { id: true },
		},
		master,
	)

/** Removes a member from a staff role. */
export const removeStaffMember = (
	role: 'administrator' | 'editor',
	memberId: string,
) =>
	StaffRole.updateOne(
		{
			where: { name: role },
			data: { members: { disconnect: [Member.pointer(memberId)] } },
			select: { id: true },
		},
		master,
	)

/**
 * Makes administrators editors too: Editor includes the Administrator role,
 * so Administrator's members are members of Editor. Connecting it again
 * changes nothing.
 */
export const includeAdministratorsInEditors = async () => {
	const administrator = await StaffRole.findOneOrThrow(
		{ where: { name: 'administrator' }, select: { id: true } },
		master,
	)
	return StaffRole.updateOne(
		{
			where: { name: 'editor' },
			data: { includedRoles: { connect: [administrator.id] } },
			select: { id: true },
		},
		master,
	)
}
//#endregion staff-admin
