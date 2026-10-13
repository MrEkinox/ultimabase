import { ACL } from '@ultimabase/acl-permissions-plugin'
import { resolveRoleReference } from '@ultimabase/roles-plugin'

import { Announcement, Member, Note, Team } from './schema.ts'

// Trusted server code: Master authority comes from the application's
// configured key, never from a client-selected `useMasterKey` flag.

/** Adds a member to the `editors` role. */
export const addEditor = (memberId: string) =>
	Team.updateOne(
		{
			data: { members: { connect: [Member.pointer(memberId)] } },
			where: { name: { eq: 'editors' } },
		},
		{ useMasterKey: true },
	)

//#region master-acl
/** Imports a note with a complete ACL: Master writes it as is. */
export const importNote = (title: string, ownerId: string) =>
	Note.createOne(
		{
			data: {
				title,
				acl: new ACL(Member.pointer(ownerId)).grantPublic('read'),
			},
		},
		{ useMasterKey: true },
	)

/** Hides a note from everyone but Master, whoever it was shared with. */
export const hideNote = (noteId: string) =>
	Note.updateOne(
		{ where: { id: noteId }, data: { acl: new ACL() } },
		{ useMasterKey: true },
	)

/** Master may filter on the ACL itself; clients never can. */
export const listPublicNotes = () =>
	Note.findMany(
		{
			where: { acl: { contains: { public: ['read'] } } },
			select: { title: true },
		},
		{ useMasterKey: true },
	)
//#endregion master-acl

//#region entries
/** Lists who holds which rights on an announcement, roles by name. */
export const describeAnnouncementACL = async (announcementId: string) => {
	const { acl } = await Announcement.findOneOrThrow(
		{ where: { id: announcementId }, select: { acl: true } },
		{ useMasterKey: true },
	)
	return Promise.all(
		acl.entries().map(async (entry) => {
			const rights = entry.permissions.join(', ')
			switch (entry.kind) {
				case 'principal':
					return `member ${entry.principal.id}: ${rights}`
				case 'role': {
					// A stored reference does not name its role schema, so the
					// resolved row is untyped: check the name before using it.
					const { name } = await resolveRoleReference(entry.role, {
						useMasterKey: true,
					})
					return `role ${typeof name === 'string' ? name : entry.role.value}: ${rights}`
				}
				default:
					return `${entry.kind}: ${rights}`
			}
		}),
	)
}
//#endregion entries
