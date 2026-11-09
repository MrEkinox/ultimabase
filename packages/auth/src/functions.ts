// auth's functions (D-113): `signOut`, which ends the request's session and
// clears its cookie, and `viewer`, the caller's user read again as the caller.
import type {
	Client,
	FunctionShape,
	ModelQueries,
	OutputSpec,
} from 'ultimabase'
import { allow, defineFunction, PublicError } from 'ultimabase'
import { closeSession } from './sessions.ts'
import type { Cookie } from './token.ts'

/** Each session's token, by the user row `identify` read for it (D-121). */
export const callerTokens: WeakMap<object, string> = new WeakMap()

/** The user model's queries, and its output `User`, or `null`. */
export interface Users {
	readonly queries: ModelQueries
	readonly output: OutputSpec
}

/** Refuses signing in or out over a WebSocket: it sets no cookie (D-354). */
export function needsCookies(client: Client | undefined): void {
	if (client?.cookies.settable !== false) return
	throw new PublicError('BAD_REQUEST', 'Signing in or out needs HTTP.')
}

/** `signOut` and `viewer`, public: each reads the caller only. */
export function authFunctions(
	cookie: Cookie,
	users: Users,
): readonly FunctionShape[] {
	const signOut = defineFunction({
		name: 'signOut',
		run: async ({ caller, client }) => {
			needsCookies(client)
			client?.cookies.clear(cookie.name, cookie.options)
			const token =
				caller.kind === 'user' ? callerTokens.get(caller.user) : undefined
			if (token !== undefined) await closeSession(token)
			// A Bearer's request may carry another session's cookie: it ends too.
			const held = client?.cookies.get(cookie.name)
			if (held !== undefined && held !== token) await closeSession(held)
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
