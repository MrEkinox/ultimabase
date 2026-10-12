import { immutableRecord } from '@ultimabase/shared'
import {
	contributeOperation,
	type PluginOperationContribution,
} from '@ultimabase/core/plugin'

import { listLinkedAccounts, removeLinkedAccount } from './accounts.js'
import { rejectLastMethod, rejectNotFound, rejectSession } from './errors.js'
import type { AuthEventEmitter } from './events.js'
import {
	readAuthenticated,
	requireCollections,
	requireUser,
	type AuthState,
} from './foundation.js'
import type { AuthMethodImplementation, AuthServices } from './method.js'
import { authOperations, authPublicOperations } from './operations.js'
import { readAuthenticationResult, readUserProfile } from './profile.js'
import {
	advanceUserGeneration,
	listUserSessions,
	revokeCurrentSession,
	revokeSessionById,
	rotateSession,
} from './sessions.js'

type Operations = typeof authOperations

/** Creates the handlers of the foundation's operations. */
export const createAuthHandlers = (options: {
	readonly emit: AuthEventEmitter
	readonly methods: readonly AuthMethodImplementation[]
	readonly services: AuthServices
	readonly state: AuthState
}): readonly [
	PluginOperationContribution<Operations['current']>,
	PluginOperationContribution<Operations['refresh']>,
	PluginOperationContribution<Operations['logout']>,
	PluginOperationContribution<Operations['logoutEverywhere']>,
	PluginOperationContribution<Operations['listSessions']>,
	PluginOperationContribution<Operations['revokeSession']>,
	PluginOperationContribution<Operations['listMethods']>,
	PluginOperationContribution<Operations['unlinkMethod']>,
	PluginOperationContribution<Operations['deleteAccount']>,
] => {
	const { emit, methods, services, state } = options
	const collections = () => requireCollections(state)
	return [
		contributeOperation({
			operation: authOperations.current,
			public: authPublicOperations.current,
			execute: async ({ context }) => {
				const { userId } = readAuthenticated(state, context)
				return (await readUserProfile(requireUser(state), userId)) as Readonly<
					Record<string, unknown>
				>
			},
		}),
		contributeOperation({
			operation: authOperations.refresh,
			public: authPublicOperations.refresh,
			execute: async ({ context }) => {
				const { session } = readAuthenticated(state, context)
				const rotated = await rotateSession(
					collections(),
					session,
					services.sessionPolicy,
				)
				if (rotated === undefined) return rejectSession()
				return readAuthenticationResult(
					requireUser(state),
					rotated.userId,
					rotated,
					context,
				)
			},
		}),
		contributeOperation({
			operation: authOperations.logout,
			public: authPublicOperations.logout,
			execute: async ({ context }) => {
				const { session, userId } = readAuthenticated(state, context)
				if (!(await revokeCurrentSession(collections(), session))) {
					return rejectSession()
				}
				emit(
					'afterLogout',
					{ everywhere: false, sessionId: session.id, userId },
					context.requestId,
				)
				return immutableRecord({ revoked: true as const })
			},
		}),
		contributeOperation({
			operation: authOperations.logoutEverywhere,
			public: authPublicOperations.logoutEverywhere,
			execute: async ({ context }) => {
				const { userId } = readAuthenticated(state, context)
				await advanceUserGeneration(collections(), userId)
				emit(
					'afterLogout',
					{ everywhere: true, sessionId: null, userId },
					context.requestId,
				)
				return immutableRecord({ revoked: true as const })
			},
		}),
		contributeOperation({
			operation: authOperations.listSessions,
			public: authPublicOperations.listSessions,
			execute: async ({ context }) => {
				const { session, userId } = readAuthenticated(state, context)
				return immutableRecord({
					sessions: await listUserSessions(collections(), userId, session.id),
				})
			},
		}),
		contributeOperation({
			operation: authOperations.revokeSession,
			public: authPublicOperations.revokeSession,
			execute: async ({ context, input }) => {
				const { userId } = readAuthenticated(state, context)
				if (!(await revokeSessionById(collections(), userId, input.id))) {
					return rejectNotFound()
				}
				emit(
					'afterLogout',
					{ everywhere: false, sessionId: input.id, userId },
					context.requestId,
				)
				return immutableRecord({ revoked: true as const })
			},
		}),
		contributeOperation({
			operation: authOperations.listMethods,
			public: authPublicOperations.listMethods,
			execute: async ({ context }) => {
				const { userId } = readAuthenticated(state, context)
				return immutableRecord({
					methods: await listLinkedAccounts(collections(), userId),
				})
			},
		}),
		contributeOperation({
			operation: authOperations.unlinkMethod,
			public: authPublicOperations.unlinkMethod,
			execute: async ({ context, input }) => {
				const { userId } = readAuthenticated(state, context)
				services.requireRecentAuthentication(context)
				const removed = await removeLinkedAccount(
					collections(),
					userId,
					input.id,
				)
				if (removed === 'missing') return rejectNotFound()
				if (removed === 'last') return rejectLastMethod()
				// The method deletes its own secrets of this user.
				await methods
					.find(({ name }) => name === removed.method)
					?.unlink?.(userId, context)
				return immutableRecord({ unlinked: true as const })
			},
		}),
		contributeOperation({
			operation: authOperations.deleteAccount,
			public: authPublicOperations.deleteAccount,
			execute: async ({ context }) => {
				const { userId } = readAuthenticated(state, context)
				services.requireRecentAuthentication(context)
				// Sessions, linked accounts and method secrets reference the User
				// with `onDelete: 'cascade'`; the plugin's own elevation deletes it.
				await requireUser(state).deleteOne(
					{ where: { id: userId } },
					{ useMasterKey: true },
				)
				return immutableRecord({ deleted: true as const })
			},
		}),
	]
}
