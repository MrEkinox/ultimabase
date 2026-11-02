// The caller of a signed-in user, for a test's `{ as }` (D-80, D-97); the
// kernel completes it with its plugins' keys (D-121). In an application a
// user caller comes from a session (D-39).
import type { Identity, Register, UserRowOf } from 'ultimabase'

type UserIdentity = Extract<Identity, { readonly kind: 'user' }>

/**
 * A user row has an `id`. A sign-up's or a Master read's row holds every
 * field (D-203); the contract suites' models read only the `id`.
 */
const isUserRecord = (value: {
	readonly id: string
}): value is UserIdentity['user'] => 'id' in value

function callerOf(user: { readonly id: string }): Identity {
	if (!isUserRecord(user)) throw new TypeError('A user record has an id.')
	const caller: UserIdentity = Object.freeze({ kind: 'user', user })
	return caller
}

/**
 * Acts as `user`, the registered user model's row as a sign-up or a Master
 * read gives it (D-203), or `{ id }` without one.
 */
export function asUser(user: UserRowOf<Register>): Identity {
	return callerOf(user)
}

/**
 * A user caller of id `id` for the contract suites, whatever user model an
 * application registers.
 */
export function suiteUser(id: string): Identity {
	return callerOf({ id })
}
