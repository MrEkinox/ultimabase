// The caller of a signed-in user, for a test's `{ as }` (D-80, D-97). In an
// application a user caller comes from a session (D-39).
import type { Caller } from 'ultimabase'

type UserCaller = Extract<Caller, { readonly kind: 'user' }>

/** Acts as `user`, the registered user model's record, or `{ id }` without one. */
export function asUser(user: UserCaller['user']): Caller {
	const caller: UserCaller = Object.freeze({ kind: 'user', user })
	return caller
}
