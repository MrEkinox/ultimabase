// `authPlugin()` (D-112): the caller of each request from its session, the
// API sign-in methods open sessions with, and the sign-out route.
import type { Http } from '@ultimabase/http'
import { httpPlugin, routes } from '@ultimabase/http'
import type {
	Caller,
	ModelQueries,
	PluginOf,
	PluginTypes,
	Register,
	UseOf,
	UserOf,
} from 'ultimabase'
import { definePlugin, master, PublicError } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import type { Opened } from './sessions.ts'
import {
	AuthSession,
	closeSession,
	openSession,
	revokeSessions,
	sessionUser,
} from './sessions.ts'
import type { Cookie, Reply } from './token.ts'
import { bearerOf, cookieOf, cookieTokenOf, setCookie } from './token.ts'

export type { Opened } from './sessions.ts'
export type { Reply } from './token.ts'

/** What auth offers the sign-in methods (D-33, D-112). */
export interface AuthApi {
	/** Opens a session for `userId` and sets its cookie on `c`'s response. */
	signIn(c: Reply, userId: string): Promise<Opened>
	/** Ends every session of a user. */
	revokeSessions(userId: string): Promise<void>
}

/** auth's types (D-57). */
export interface Auth extends PluginTypes {
	readonly name: 'auth'
	readonly requires: Http
	readonly api: AuthApi
}

/** The models `defineUser` returned. */
export const userModels: WeakSet<object> = new WeakSet()

/** What each running application's auth reads, by its context. */
interface State {
	readonly cookie: Cookie
	readonly users: ModelQueries
}
const states = new WeakMap<object, State>()

const M = { as: master }

function stateOf(context: object): State {
	const state = states.get(context)
	if (state === undefined) throw new Error('auth has not started.')
	return state
}

/** The one user model among the application's models (D-62). */
function usersOf(models: readonly { readonly queries: ModelQueries }[]) {
	const users = models.filter((model) => userModels.has(model.queries))
	const [first, second] = users
	if (first === undefined) {
		throw new Error(
			'authPlugin() needs a user model: declare it with defineUser (D-62).',
		)
	}
	if (second !== undefined) {
		throw new Error(
			'models lists two models defineUser returned: an application has one user model (D-62).',
		)
	}
	return first.queries
}

/** The caller of a session's token, or `undefined` for an unknown one. */
async function callerOf(
	token: string,
	users: ModelQueries,
): Promise<Caller | undefined> {
	const userId = await sessionUser(token)
	if (userId === undefined) return undefined
	// A transport's queries are untyped; this is the user model's row.
	const user: unknown = await users.findUnique({ where: { id: userId } }, M)
	if (user === null) return undefined
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the user model is the one the application registers (D-62, D-80).
	return { kind: 'user', user: user as UserOf<Register> }
}

const auth = definePlugin<Auth>({
	name: 'auth',
	manifest,
	requires: { http: httpPlugin },
	models: [AuthSession],
	hooks: {
		// The user's sessions go with them (D-111).
		afterDelete: async ({ record }) => {
			await revokeSessions(record.id)
		},
	},
	// Built before any plugin starts, so before the server listens.
	api: (context) => {
		const cookie = cookieOf()
		states.set(context, { cookie, users: usersOf(context.models) })
		context.plugins.http.mount(
			routes().post('/auth/sign-out', async (c) => {
				const request = c.req.raw
				const token = bearerOf(request) ?? cookieTokenOf(request, cookie)
				if (token !== undefined) await closeSession(token)
				setCookie(c, cookie, '')
				return c.body(null, 204)
			}),
		)
		return {
			signIn: async (c, userId) => {
				const opened = await openSession(userId)
				setCookie(c, cookie, opened.token)
				return opened
			},
			revokeSessions,
		}
	},
	identify: async (request, context) => {
		const { cookie, users } = stateOf(context)
		const bearer = bearerOf(request)
		if (bearer !== undefined) {
			const caller = await callerOf(bearer, users)
			if (caller !== undefined) return caller
			throw new PublicError(
				'UNAUTHENTICATED',
				'The session expired or was revoked: sign in again.',
			)
		}
		// A stale cookie is anonymous: it must not lock a browser out of
		// signing in again (D-112).
		const token = cookieTokenOf(request, cookie)
		return token === undefined ? undefined : callerOf(token, users)
	},
})

/** Sessions and the caller of each request; it requires `httpPlugin()`. */
export const authPlugin: PluginOf<Auth> = auth.plugin
/** auth's entry in the user model's `use`, which `defineUser` adds. */
export const authUse: UseOf<Auth> = auth.use
