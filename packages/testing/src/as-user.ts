// The caller of a signed-in user, for a test's `{ as }` (D-80, D-97); the
// kernel completes it with its plugins' keys (D-121). In an application a
// user caller comes from a session (D-39).
import type { Identity } from 'ultimabase'

type UserIdentity = Extract<Identity, { readonly kind: 'user' }>

/** Acts as `user`, the registered user model's record, or `{ id }` without one. */
export function asUser(user: UserIdentity['user']): Identity {
	const caller: UserIdentity = Object.freeze({ kind: 'user', user })
	return caller
}
