// The user model: who signs in, and what each user reads and changes.
//#region user
import { defineUser, isAuthenticated, isSelf } from '@ultimabase/auth'
import { graphql } from '@ultimabase/graphql'
import { password } from '@ultimabase/password'
import { allow } from 'ultimabase'
import { Post } from './models.ts'

export const User = defineUser({
	name: 'User',
	use: [graphql(), password()],
	fields: (f) => ({
		name: f.string(),
		// Only the server makes an editor: no client writes this field.
		editor: f.boolean({ default: false }).with({ access: allow.readOnly }),
		posts: f.many(() => Post, { inverse: 'author' }),
	}),
}).with({
	// Signed-in users read each other's names; each user changes their own.
	access: { read: isAuthenticated, update: isSelf },
})
//#endregion

//#region register
// Every rule, hook and function now reads `caller.user` as a `User`.
declare module 'ultimabase' {
	interface Register {
		readonly user: typeof User
	}
}
//#endregion
