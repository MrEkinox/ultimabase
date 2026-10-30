// The users and the roles they hold.
//#region role
import { defineUser } from '@ultimabase/auth'
import { graphql } from '@ultimabase/graphql'
import { password } from '@ultimabase/password'
import { defineRole } from '@ultimabase/roles'
import { allow } from 'ultimabase'

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
