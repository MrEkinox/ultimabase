import { Member, Note } from './schema.ts'

// Client code: these calls run as the current caller, so the ACL and
// `clientSharing` decide whether they may share the note.

//#region share
/** Lets one member read the note, without reading its ACL first. */
export const shareNote = (noteId: string, memberId: string) =>
	Note.updateOne({
		where: { id: noteId },
		data: {
			acl: {
				grant: { principal: Member.pointer(memberId), permissions: ['read'] },
			},
		},
	})

/** Removes every right the member holds on the note. */
export const unshareNote = (noteId: string, memberId: string) =>
	Note.updateOne({
		where: { id: noteId },
		data: { acl: { revoke: { principal: Member.pointer(memberId) } } },
	})
//#endregion share
