// The notes, whose rows say who reads and who writes them.
//#region note
import { ACL, acl } from '@ultimabase/acl'
import { graphql } from '@ultimabase/graphql'
import { hasRole } from '@ultimabase/roles'
import { allow, defineModel } from 'ultimabase'

export const Note = defineModel({
	name: 'Note',
	use: [
		graphql(),
		// A new note is its author's alone: no one else reads or writes it.
		acl({
			default: ({ caller }) =>
				caller.kind === 'user' ? new ACL().allowUser(caller.user) : new ACL(),
		}),
	],
	fields: (f) => ({ title: f.string() }),
}).with({
	// The ACL picks the rows; the rules pick who writes a new note.
	access: {
		read: allow.public,
		create: hasRole('writer'),
		update: allow.public,
		delete: allow.public,
	},
})
//#endregion
