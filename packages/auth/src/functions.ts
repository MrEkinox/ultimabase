// auth's functions (D-113): `signOut`, which ends the request's session and
// clears its cookie, and `viewer`, the caller's user read again as the caller.
import type { FunctionShape, ModelQueries, OutputSpec } from 'ultimabase'
import { allow, defineFunction } from 'ultimabase'
import { closeSession } from './sessions.ts'
import type { Cookie } from './token.ts'

/** Each session's token, by the user row `identify` read for it (D-121). */
export const callerTokens: WeakMap<object, string> = new WeakMap()

/** The user model's queries, and its output `User`, or `null`. */
export interface Users {
	readonly queries: ModelQueries
	readonly output: OutputSpec
}

/** `signOut` and `viewer`, public: each reads the caller only. */
export function authFunctions(
	cookie: Cookie,
	users: Users,
): readonly FunctionShape[] {
	const signOut = defineFunction({
		name: 'signOut',
		run: async ({ caller, client }) => {
			const token =
				caller.kind === 'user' ? callerTokens.get(caller.user) : undefined
			if (token !== undefined) await closeSession(token)
			client?.cookies.clear(cookie.name, cookie.options)
		},
	}).with({ access: allow.public })
	const viewer = defineFunction({
		name: 'viewer',
		query: true,
		output: users.output,
		run: async ({ caller }) =>
			caller.kind === 'user'
				? users.queries.findUnique(
						{ where: { id: caller.user.id } },
						{ as: caller },
					)
				: null,
	}).with({ access: allow.public })
	return [signOut, viewer]
}
