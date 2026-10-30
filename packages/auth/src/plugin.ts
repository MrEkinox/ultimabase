// `authPlugin()` (D-112, D-113): the caller of each request from its
// session, the API sign-in methods open sessions and link accounts with, and
// its functions and command.
import type { Http } from '@ultimabase/http'
import { httpPlugin } from '@ultimabase/http'
import type {
	Client,
	Identity,
	OutputSpec,
	PluginOf,
	PluginTypes,
	Register,
	UseOf,
	UserOf,
} from 'ultimabase'
import {
	definePlugin,
	isLocalHost,
	isMaster,
	master,
	PublicError,
	Refused,
} from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import {
	accountOf,
	AuthAccount,
	linkAccount,
	subjectOf,
	unlinkAccounts,
} from './accounts.ts'
import type { Users } from './functions.ts'
import { authFunctions, callerTokens } from './functions.ts'
import type { Opened } from './sessions.ts'
import {
	AuthSession,
	closeSession,
	openSession,
	revokeSessions,
	sessionOf,
} from './sessions.ts'
import type { Cookie } from './token.ts'
import { bearerOf, cookieAge, cookieOf, cookieTokenOf } from './token.ts'

export type { Opened } from './sessions.ts'

/** What auth offers the sign-in methods (D-33, D-112, D-113). */
export interface AuthApi {
	/**
	 * Opens a session for `userId`, and sets its cookie when a transport's
	 * `client` is given, ending the session the cookie it replaces held.
	 */
	signIn(userId: string, client?: Client): Promise<Opened>
	/** Ends every session of a user. */
	revokeSessions(userId: string): Promise<void>
	/** Links `userId` to `subject` of `method`; a taken pair is a `UNIQUE_VIOLATION`. */
	linkAccount(userId: string, method: string, subject: string): Promise<void>
	/** The user `subject` of `method` signs in as, if any. */
	accountOf(
		method: string,
		subject: string,
	): Promise<{ readonly userId: string } | undefined>
	/** The subject `userId` is known by to `method`, if linked (D-117). */
	subjectOf(userId: string, method: string): Promise<string | undefined>
}

/** auth's commands on the user model (D-113). */
export interface AuthCommands {
	/** Ends every session of the user, as Master or as the user. */
	revokeSessions(
		where: { readonly id: string },
		options?: { readonly as?: Identity },
	): Promise<void>
}

/** auth's types (D-57). */
export interface Auth extends PluginTypes {
	readonly name: 'auth'
	readonly requires: Http
	readonly api: AuthApi
	readonly commands: AuthCommands
}

/** The models `defineUser` returned, each with its output `User`, or `null`. */
export const userModels: WeakMap<object, OutputSpec> = new WeakMap()

/** What each running application's auth reads, by its context. */
interface State {
	readonly cookie: Cookie
	readonly users: Users
}
const states = new WeakMap<object, State>()
/** The contexts whose insecure cookie was warned about (D-115). */
const warned = new WeakSet<object>()

const M = { as: master }

function stateOf(context: object): State {
	const state = states.get(context)
	if (state === undefined) throw new Error('auth has not started.')
	return state
}

/** The one user model among the application's models (D-62). */
function usersOf(
	models: readonly { readonly queries: Users['queries'] }[],
): Users {
	const [first, second] = models.flatMap(({ queries }) => {
		const output = userModels.get(queries)
		return output === undefined ? [] : [{ queries, output }]
	})
	if (first === undefined) {
		throw new Refused(
			'authPlugin() needs a user model: declare it with defineUser.',
		)
	}
	if (second !== undefined) {
		throw new Refused(
			'models lists two models defineUser returned: an application has one user model.',
		)
	}
	return first
}

/** A session token's caller, until it ends; `undefined` for an unknown one. */
async function callerOf(
	token: string,
	users: Users,
	expires: (at: Date) => void,
): Promise<Identity | undefined> {
	const session = await sessionOf(token)
	if (session === undefined) return undefined
	// A transport's queries are untyped; this is the user model's row.
	const user: unknown = await users.queries.findUnique(
		{ where: { id: session.userId } },
		M,
	)
	if (user === null) return undefined
	expires(session.expiresAt)
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the user model is the one the application registers (D-62, D-80).
	const caller: Identity = { kind: 'user', user: user as UserOf<Register> }
	// The completed caller keeps this row (D-121).
	callerTokens.set(caller.user, token)
	return caller
}

const auth = definePlugin<Auth>({
	name: 'auth',
	manifest,
	requires: { http: httpPlugin },
	models: [AuthSession, AuthAccount],
	hooks: {
		// The user's sessions and accounts go with them (D-111, D-113).
		afterDelete: async ({ record }) => {
			await revokeSessions(record.id)
			await unlinkAccounts(record.id)
		},
	},
	commands: () => ({
		revokeSessions: async ({ id }, options) => {
			const caller = options?.as
			const self = caller?.kind === 'user' && caller.user.id === id
			if (!self && (caller === undefined || !isMaster(caller))) {
				throw new PublicError(
					'ACCESS_DENIED',
					'User.revokeSessions runs as Master or as the user.',
				)
			}
			await revokeSessions(id)
		},
	}),
	// Its own cookie and user model: this context is not the API's.
	functions: ({ models }) => authFunctions(cookieOf(), usersOf(models)),
	// Built before any plugin starts, so before the server listens.
	api: (context) => {
		const cookie = cookieOf()
		states.set(context, { cookie, users: usersOf(context.models) })
		return {
			signIn: async (userId, client) => {
				// The cookie it replaces would leave a session nobody can end (D-115).
				const replaced = client?.cookies.get(cookie.name)
				if (replaced !== undefined) await closeSession(replaced)
				const opened = await openSession(userId)
				client?.cookies.set(cookie.name, opened.token, {
					...cookie.options,
					maxAge: cookieAge,
				})
				return opened
			},
			revokeSessions,
			linkAccount,
			accountOf,
			subjectOf,
		}
	},
	// A sign-in method requires auth: without one, nobody signs in (D-164).
	start: ({ dependents, logger }) => {
		if (dependents.length > 0) return
		logger.warn(
			'authPlugin() has no sign-in method: add one, as passwordPlugin().',
		)
	},
	identify: async (request, context) => {
		const { cookie, users } = stateOf(context)
		const { hostname } = new URL(request.url)
		if (
			!cookie.options.secure &&
			!warned.has(context) &&
			!isLocalHost(hostname)
		) {
			warned.add(context)
			context.logger.warn(
				`auth serves ${hostname} a session cookie without Secure: set NODE_ENV=production.`,
			)
		}
		const bearer = bearerOf(request)
		if (bearer !== undefined) {
			const caller = await callerOf(bearer, users, context.expires)
			if (caller !== undefined) return caller
			throw new PublicError(
				'UNAUTHENTICATED',
				'The session expired or was revoked: sign in again.',
			)
		}
		// A stale cookie is anonymous: it must not lock a browser out of
		// signing in again (D-112).
		const token = cookieTokenOf(request, cookie)
		if (token === undefined) return undefined
		return callerOf(token, users, context.expires)
	},
})

/** Sessions and the caller of each request; it requires `httpPlugin()`. */
export const authPlugin: PluginOf<Auth> = auth.plugin
/** auth's entry in the user model's `use`, which `defineUser` adds. */
export const authUse: UseOf<Auth> = auth.use
