import {
	FrameworkError,
	Pointer,
	operationHandler,
	type PluginOperationHandlerDefinition,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import {
	findPasswordCredentialByUsername,
	insertPasswordCredential,
	upgradePasswordCredential,
	type PasswordCredentialCollection,
} from './credentials.js'
import {
	normalizePasswordInput,
	normalizePasswordUsername,
} from './normalization.js'
import {
	passwordAuthOperations,
	rejectPasswordCredentials,
	rejectPasswordSession,
	rejectPasswordSignUp,
} from './operations.js'
import {
	createNormalizedPasswordVerifier,
	verifyNormalizedPasswordOrDummy,
} from './password-hasher.js'
import type { ResolvedPasswordHashPolicy } from './password-policy.js'
import { passwordSession } from './session.js'
import { readPasswordAuthenticationResult } from './authentication-result.js'
import type { ResolvedPasswordSessionPolicy } from './session-policy.js'
import {
	issuePasswordSession,
	revokePasswordSession,
	rotatePasswordSession,
	type PasswordSessionCollection,
} from './sessions.js'
import type { PasswordUserDefinition } from './user-schema.js'

interface PasswordOperationHandlerOptions<
	TUser extends PasswordUserDefinition,
> {
	readonly credentials: PasswordCredentialCollection
	readonly passwordPolicy: ResolvedPasswordHashPolicy
	readonly sessionPolicy: ResolvedPasswordSessionPolicy
	readonly sessions: PasswordSessionCollection
	readonly user: TUser
}

const normalizeCredentials = (
	input: Readonly<{ readonly password: string; readonly username: string }>,
): Readonly<{ readonly password: string; readonly username: string }> =>
	immutableRecord({
		password: normalizePasswordInput(input.password),
		username: normalizePasswordUsername(input.username),
	})

const isValidationFailure = (error: unknown): boolean =>
	error instanceof FrameworkError && error.code === 'VALIDATION_ERROR'

const readModelPointer = <TUser extends PasswordUserDefinition>(
	user: TUser,
	model: unknown,
): Pointer<TUser> => {
	if (typeof model !== 'object' || model === null) {
		throw new TypeError('Password Auth User creation returned no model')
	}
	const toPointer: unknown = Reflect.get(model, 'toPointer')
	if (typeof toPointer !== 'function') {
		throw new TypeError('Password Auth User result has no pointer')
	}
	const pointer: unknown = Reflect.apply(toPointer, model, [])
	if (!Pointer.is(pointer) || pointer.schema !== user) {
		throw new TypeError('Password Auth User result has a foreign pointer')
	}
	return pointer as Pointer<TUser>
}

const createSignUpHandler = <TUser extends PasswordUserDefinition>(
	options: PasswordOperationHandlerOptions<TUser>,
) =>
	operationHandler({
		operation: passwordAuthOperations.signUp,
		execute: async ({ engine, input }) => {
			let normalized: ReturnType<typeof normalizeCredentials>
			try {
				normalized = normalizeCredentials(input)
			} catch {
				return rejectPasswordSignUp()
			}
			const verifier = await createNormalizedPasswordVerifier(
				normalized.password,
				options.passwordPolicy,
			)
			try {
				return await engine.transaction(async (transaction) => {
					const created = await options.user.createOne(
						{ data: { username: normalized.username } },
						transaction.context.access.mode === 'master'
							? undefined
							: { useMasterKey: true },
					)
					const pointer = readModelPointer(options.user, created)
					await insertPasswordCredential(options.credentials, {
						passwordVerifier: verifier.encoded,
						policyVersion: verifier.policyVersion,
						userId: pointer.id,
						username: normalized.username,
					})
					const session = await issuePasswordSession(
						options.sessions,
						pointer.id,
						options.sessionPolicy,
					)
					return readPasswordAuthenticationResult(
						options.user,
						pointer.id,
						session,
						transaction.context,
					)
				})
			} catch (error: unknown) {
				if (isValidationFailure(error)) return rejectPasswordSignUp()
				throw error
			}
		},
	})

const unchangedCredential = (
	left: Readonly<{
		readonly passwordVerifier: string
		readonly policyVersion: number
		readonly userId: string
		readonly username: string
	}>,
	right: typeof left,
): boolean =>
	left.passwordVerifier === right.passwordVerifier &&
	left.policyVersion === right.policyVersion &&
	left.userId === right.userId &&
	left.username === right.username

const createLoginHandler = <TUser extends PasswordUserDefinition>(
	options: PasswordOperationHandlerOptions<TUser>,
) =>
	operationHandler({
		operation: passwordAuthOperations.login,
		execute: async ({ engine, input }) => {
			let normalized: ReturnType<typeof normalizeCredentials>
			try {
				normalized = normalizeCredentials(input)
			} catch {
				return rejectPasswordCredentials()
			}
			const credential = await findPasswordCredentialByUsername(
				options.credentials,
				normalized.username,
			)
			const verification = await verifyNormalizedPasswordOrDummy(
				normalized.password,
				credential === null
					? null
					: {
							encoded: credential.passwordVerifier,
							policyVersion: credential.policyVersion,
						},
				options.passwordPolicy,
			)
			if (credential === null || !verification.matches) {
				return rejectPasswordCredentials()
			}
			const upgraded = verification.requiresUpgrade
				? await createNormalizedPasswordVerifier(
						normalized.password,
						options.passwordPolicy,
					)
				: undefined
			return engine.transaction(async (transaction) => {
				const current = await findPasswordCredentialByUsername(
					options.credentials,
					normalized.username,
				)
				if (current === null || !unchangedCredential(current, credential)) {
					return rejectPasswordCredentials()
				}
				if (
					upgraded !== undefined &&
					(await upgradePasswordCredential(options.credentials, current, {
						passwordVerifier: upgraded.encoded,
						policyVersion: upgraded.policyVersion,
					})) === null
				) {
					return rejectPasswordCredentials()
				}
				const session = await issuePasswordSession(
					options.sessions,
					current.userId,
					options.sessionPolicy,
				)
				return readPasswordAuthenticationResult(
					options.user,
					current.userId,
					session,
					transaction.context,
				)
			})
		},
	})

const createLogoutHandler = (
	options: PasswordOperationHandlerOptions<PasswordUserDefinition>,
) =>
	operationHandler({
		operation: passwordAuthOperations.logout,
		execute: async ({ context }) => {
			const session = context.getValue(passwordSession)
			if (
				session === undefined ||
				!(await revokePasswordSession(options.sessions, session))
			) {
				return rejectPasswordSession()
			}
			return immutableRecord({ revoked: true as const })
		},
	})

const createRefreshHandler = <TUser extends PasswordUserDefinition>(
	options: PasswordOperationHandlerOptions<TUser>,
) =>
	operationHandler({
		operation: passwordAuthOperations.refresh,
		execute: async ({ context }) => {
			const session = context.getValue(passwordSession)
			if (session === undefined) return rejectPasswordSession()
			const rotated = await rotatePasswordSession(
				options.sessions,
				session,
				options.sessionPolicy,
			)
			if (rotated === undefined) return rejectPasswordSession()
			return readPasswordAuthenticationResult(
				options.user,
				rotated.userId,
				rotated,
				context,
			)
		},
	})

/** Creates the four application-local handlers from one private auth state. */
export const createPasswordOperationHandlers = <
	TUser extends PasswordUserDefinition,
>(
	options: PasswordOperationHandlerOptions<TUser>,
): readonly [
	PluginOperationHandlerDefinition<typeof passwordAuthOperations.signUp>,
	PluginOperationHandlerDefinition<typeof passwordAuthOperations.login>,
	PluginOperationHandlerDefinition<typeof passwordAuthOperations.logout>,
	PluginOperationHandlerDefinition<typeof passwordAuthOperations.refresh>,
] => [
	createSignUpHandler(options),
	createLoginHandler(options),
	createLogoutHandler(options),
	createRefreshHandler(options),
]
