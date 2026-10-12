import { randomUUID } from 'node:crypto'

import type { ApplicationRequestExecutor } from '@ultimabase/core'
import {
	requestSources,
	type ApplicationCallbackExecutor,
	type PluginIdentity,
} from '@ultimabase/core/plugin'
import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

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
					return executor.runWithContext(authenticated, () => handler())
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
		revokeSessions: (user: AuthUserTarget) =>
			asPlugin(async () => {
				await advanceUserGeneration(requireCollections(state), readUserId(user))
			}),
	})
}
