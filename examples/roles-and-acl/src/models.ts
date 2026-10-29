// The models: users who hold roles, and notes whose rows say who reads and
// who writes them.
import { ACL, acl } from '@ultimabase/acl'
import { defineUser } from '@ultimabase/auth'
import { graphql } from '@ultimabase/graphql'
import { password } from '@ultimabase/password'
import { defineRole, hasRole } from '@ultimabase/roles'
import { allow, defineModel } from 'ultimabase'

//#region role
// Each role has a unique name, its members, and the roles it inherits.
export const Role = defineRole({
	name: 'Role',
	members: () => User,
	use: [graphql()],
	// Clients read the roles; the server gives them.
}).with({ access: allow.readOnly })
//#endregion

//#region user
export const User = defineUser({
	name: 'User',
	use: [graphql(), password()],
	fields: (f) => ({ name: f.string(), roles: f.many(() => Role) }),
}).with({ access: allow.readOnly })

declare module 'ultimabase' {
	interface Register {
		readonly user: typeof User
	}
}
//#endregion

//#region note
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
