// The user model: who signs in, with an email and a password.
import { defineUser, isAuthenticated } from '@ultimabase/auth'
import { password } from '@ultimabase/password'

export const User = defineUser({
	name: 'User',
	use: [password()],
	fields: (f) => ({ name: f.string({ optional: true }) }),
}).with({
	// Signed-in users read users: sign-up returns the new one.
	access: { read: isAuthenticated },
})

// Every function now reads `user` as a `User`.
declare module 'ultimabase' {
	interface Register {
		readonly user: typeof User
	}
}
