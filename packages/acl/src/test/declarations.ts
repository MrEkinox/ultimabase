// An application that emits declarations without isolatedDeclarations
// (D-70): what it exports names the plugin's types, which must be exported.
import { ACL, acl, aclPlugin } from '@ultimabase/acl'
import { defineRole, rolesPlugin } from '@ultimabase/roles'
import { allow, defineApp, defineModel, memory } from 'ultimabase'

export const Role = defineRole({ name: 'Role', members: () => User })

export const User = defineModel({
	name: 'User',
	fields: (f) => ({ email: f.string(), roles: f.many(() => Role) }),
})

/** A note its author reads and writes, and no one else. */
export const Note = defineModel({
	name: 'Note',
	use: [
		acl({
			default: ({ caller }) =>
				caller.kind === 'user'
					? new ACL().allowUser(caller.user)
					: new ACL().allowPublic('read'),
		}),
	],
	fields: (f) => ({ title: f.string() }),
}).with({ access: allow.public })

export const app = defineApp({
	database: memory(),
	plugins: [rolesPlugin(), aclPlugin()],
	models: [Role, User, Note],
})
