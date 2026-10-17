import { randomUUID } from 'node:crypto'

import {
	getCurrentRequest,
	getCurrentUltimaBase,
	type ApplicationRequestExecutor,
} from '@ultimabase/core'
import {
	requestSources,
	type ApplicationCallbackExecutor,
	type PluginIdentity,
} from '@ultimabase/core/plugin'
import {
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import { writeUserEmailFields } from './email.js'

import { rejectSession } from './errors.js'
import {
	requireCollections,
	requireUser,
	type AuthState,
} from './foundation.js'
import { createAuthPrincipal } from './principal.js'
import { authPrincipal, authSession } from './session.js'
import {
	advanceUserGeneration,
	listUserSessions,
	validateSessionToken,
	type AuthSessionInfo,
} from './sessions.js'
import { createUserElevated } from './user-creation.js'

/** A user given to the server-side exports: an id, a model or a pointer. */
export type AuthUserTarget = string | Readonly<{ readonly id: string }>

/** What `ultimabase.plugin(authPlugin)` returns: server-side helpers. */
export interface AuthPluginExports {
	/**
	 * Validates one token, then runs the callback as that session's user.
	 * @example `await auth.runWithSession(token, () => TodoUser.current())`
	 */
	runWithSession<TResult>(
		token: string,
		handler: () => MaybePromise<TResult>,
	): Promise<TResult>
	/**
	 * Lists the live sessions of any user, for administration (server only).
	 * @example `await auth.listSessions(user)`
	 */
	listSessions(user: AuthUserTarget): Promise<readonly AuthSessionInfo[]>
	/**
	 * Revokes every session of any user, for administration (server only).
	 * @example `await auth.revokeSessions(user)`
	 */
	revokeSessions(user: AuthUserTarget): Promise<void>
	/**
	 * Creates one User without a sign-in method, for administration and
	 * seeding (server only), in one transaction. With an email method, Users
	 * are otherwise created only by sign-up: `email` (normalized, unverified)
	 * is then the only way to give such a User its email.
	 * @example `const id = await auth.createUser({ data: { displayName: 'Ada' }, email: 'ada@example.com' })`
	 */
	createUser(input: AuthUserCreation): Promise<string>
}

/** One User created by `auth.createUser` for administration or seeding. */
export interface AuthUserCreation {
	/** The User's create fields. */
	readonly data: Readonly<Record<string, unknown>>
	/** The normalized email, when a method signs in by email. */
	readonly email?: string
}

const readUserId = (user: unknown): string => {
	const id: unknown =
		typeof user === 'string'
			? user
			: typeof user === 'object' && user !== null
				? Reflect.get(user, 'id')
				: undefined
	if (typeof id !== 'string' || id.length === 0) {
		throw new TypeError('auth user must be an id, a model or a pointer')
	}
	return id
}

/** Creates the exports, attributed to the plugin for private storage. */
export const createAuthPluginExports = (options: {
	readonly callbacks: ApplicationCallbackExecutor
	readonly executor: ApplicationRequestExecutor
	readonly owner: PluginIdentity
	readonly state: AuthState
}): AuthPluginExports => {
	const { callbacks, executor, owner, state } = options
	const anonymous = () =>
		callbacks.runPlugin(owner, () =>
			executor.createAnonymousContext({
				requestId: randomUUID(),
				source: requestSources.internal,
			}),
		)
	const asPlugin = <TResult>(
		work: () => Promise<TResult>,
	): Promise<TResult> => {
		const context = anonymous()
		return callbacks.runPlugin(owner, () =>
			executor.runWithContext(context, work),
		)
	}
	return immutableRecord({
		runWithSession: async <TResult>(
			token: string,
			handler: () => MaybePromise<TResult>,
		): Promise<TResult> => {
			if (typeof handler !== 'function') {
				throw new TypeError('runWithSession handler must be a function')
			}
			const context = anonymous()
			return callbacks.runPlugin(owner, () =>
				executor.runWithContext(context, async () => {
					const validated = await validateSessionToken(
						requireCollections(state),
						token,
					)
					if (validated === undefined) return rejectSession()
					const authenticated = context
						.withValue(
							authPrincipal,
							createAuthPrincipal(requireUser(state).pointer(validated.userId)),
						)
						.withValue(authSession, validated.context)
					// The handler is application code, never the plugin: it gets no
					// power reserved to authentication, such as creating Users.
					return executor.runWithContext(authenticated, () =>
						callbacks.runApplication(() => handler()),
					)
				}),
			)
		},
		listSessions: (user: AuthUserTarget) =>
			asPlugin(() =>
				listUserSessions(
					requireCollections(state),
					readUserId(user),
					undefined,
				),
			),
		createUser: (input: AuthUserCreation) => {
			if (
				!isPlainRecord(input) ||
				!isPlainRecord(input.data) ||
				(input.email !== undefined && typeof input.email !== 'string')
			) {
				throw new TypeError('auth.createUser takes { data, email? }')
			}
			const { data, email } = input
			return asPlugin(() =>
				getCurrentUltimaBase().transaction(async () => {
					const context = getCurrentRequest()
					const userId = await createUserElevated(
						requireUser(state),
						data,
						context,
					)
					if (email !== undefined) {
						await writeUserEmailFields(
							requireUser(state),
							userId,
							{ email },
							context,
						)
					}
					return userId
				}),
			)
		},
		revokeSessions: (user: AuthUserTarget) =>
			asPlugin(async () => {
				await advanceUserGeneration(requireCollections(state), readUserId(user))
			}),
	})
}
