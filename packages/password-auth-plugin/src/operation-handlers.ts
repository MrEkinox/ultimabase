import {
	FrameworkError,
	Pointer,
	contributeOperation,
	type PluginOperationContribution,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import {
	advancePasswordSessionGeneration,
	changePasswordCredential,
	findPasswordCredentialByUserId,
	findPasswordCredentialByUsername,
	insertPasswordCredential,
	retainPasswordSessionGeneration,
	upgradePasswordCredential,
	type PasswordCredentialCollection,
	type CreatePasswordCredentialInput,
} from './credentials.js'
import {
	normalizePasswordInput,
	normalizePasswordUsername,
} from './normalization.js'
import {
	passwordAuthOperations,
	rejectPasswordChange,
	rejectPasswordCredentials,
	rejectPasswordSession,
	rejectPasswordSignUp,
} from './operations.js'
import {
	createNormalizedPasswordVerifier,
	verifyNormalizedPasswordOrDummy,
} from './password-hasher.js'
import type { ResolvedPasswordHashPolicy } from './password-policy.js'
import {
	passwordPrincipal,
	passwordSession,
	readPasswordSessionGeneration,
} from './session.js'
import { readPasswordAuthenticationResult } from './authentication-result.js'
import type { ResolvedPasswordSessionPolicy } from './session-policy.js'
import {
	advanceCurrentPasswordSessionGeneration,
	issuePasswordSession,
	revokePasswordSession,
	rotatePasswordSession,
	type PasswordSessionCollection,
} from './sessions.js'
import type { PasswordUserReference } from './user-schema.js'
import { restorePasswordSignUpValue } from './sign-up-input.js'

interface PasswordOperationHandlerOptions<TUser extends PasswordUserReference> {
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

const readModelPointer = <TUser extends PasswordUserReference>(
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

const createSignUpHandler = <TUser extends PasswordUserReference>(
	options: PasswordOperationHandlerOptions<TUser>,
) =>
	contributeOperation({
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
					// Password material never enters User data, hooks, or field validation.
					const data = Object.fromEntries(
						Object.entries(input)
							.filter(([name]) => name !== 'password' && name !== 'username')
							.map(([name, value]) => [
								name,
								restorePasswordSignUpValue(value),
							]),
					)
					const created = await options.user.createOne(
						{ data: { ...data, username: normalized.username } },
						transaction.context.access.mode === 'master'
							? undefined
							: { useMasterKey: true },
					)
					const pointer = readModelPointer(options.user, created)
					await insertPasswordCredential(options.credentials, {
						passwordVerifier: verifier.encoded,
						policyVersion: verifier.policyVersion,
						sessionGeneration: 0,
						userId: pointer.id,
						username: normalized.username,
					})
					const session = await issuePasswordSession(
						options.sessions,
						pointer.id,
						0,
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
	left: CreatePasswordCredentialInput,
	right: typeof left,
): boolean =>
	left.passwordVerifier === right.passwordVerifier &&
	left.policyVersion === right.policyVersion &&
	left.sessionGeneration === right.sessionGeneration &&
	left.userId === right.userId &&
	left.username === right.username

const createLoginHandler = <TUser extends PasswordUserReference>(
	options: PasswordOperationHandlerOptions<TUser>,
) =>
	contributeOperation({
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
					current.sessionGeneration,
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
	options: PasswordOperationHandlerOptions<PasswordUserReference>,
) =>
	contributeOperation({
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

const createLogoutEverywhereHandler = (
	options: PasswordOperationHandlerOptions<PasswordUserReference>,
) =>
	contributeOperation({
		operation: passwordAuthOperations.logoutEverywhere,
		execute: async ({ context }) => {
			const principal = context.getValue(passwordPrincipal)
			const session = context.getValue(passwordSession)
			if (principal === undefined || session === undefined) {
				return rejectPasswordSession()
			}
			const credential = await findPasswordCredentialByUserId(
				options.credentials,
				principal.user.id,
			)
			if (
				credential?.sessionGeneration !== readPasswordSessionGeneration(session)
			) {
				return rejectPasswordSession()
			}
			if (
				(await advancePasswordSessionGeneration(
					options.credentials,
					credential,
				)) === null
			) {
				return rejectPasswordSession()
			}
			return immutableRecord({ revoked: true as const })
		},
	})

const createChangePasswordHandler = (
	options: PasswordOperationHandlerOptions<PasswordUserReference>,
) =>
	contributeOperation({
		operation: passwordAuthOperations.changePassword,
		execute: async ({ context, engine, input }) => {
			const principal = context.getValue(passwordPrincipal)
			const session = context.getValue(passwordSession)
			if (principal === undefined || session === undefined) {
				return rejectPasswordSession()
			}
			let currentPassword: string
			let newPassword: string
			try {
				currentPassword = normalizePasswordInput(input.currentPassword)
				newPassword = normalizePasswordInput(input.newPassword)
			} catch {
				return rejectPasswordChange()
			}
			const credential = await findPasswordCredentialByUserId(
				options.credentials,
				principal.user.id,
			)
			if (
				credential?.sessionGeneration !== readPasswordSessionGeneration(session)
			) {
				return rejectPasswordSession()
			}
			const verification = await verifyNormalizedPasswordOrDummy(
				currentPassword,
				{
					encoded: credential.passwordVerifier,
					policyVersion: credential.policyVersion,
				},
				options.passwordPolicy,
			)
			if (!verification.matches) return rejectPasswordChange()
			const verifier = await createNormalizedPasswordVerifier(
				newPassword,
				options.passwordPolicy,
			)
			return engine.transaction(async () => {
				const current = await findPasswordCredentialByUserId(
					options.credentials,
					credential.userId,
				)
				if (current?.sessionGeneration !== credential.sessionGeneration) {
					return rejectPasswordSession()
				}
				if (!unchangedCredential(current, credential)) {
					return rejectPasswordChange()
				}
				if (
					(await changePasswordCredential(options.credentials, current, {
						passwordVerifier: verifier.encoded,
						policyVersion: verifier.policyVersion,
					})) === null ||
					!(await advanceCurrentPasswordSessionGeneration(
						options.sessions,
						session,
						current.sessionGeneration + 1,
					))
				) {
					return rejectPasswordSession()
				}
				return immutableRecord({ changed: true as const })
			})
		},
	})

const createRefreshHandler = <TUser extends PasswordUserReference>(
	options: PasswordOperationHandlerOptions<TUser>,
) =>
	contributeOperation({
		operation: passwordAuthOperations.refresh,
		execute: async ({ context }) => {
			const principal = context.getValue(passwordPrincipal)
			const session = context.getValue(passwordSession)
			if (principal === undefined || session === undefined) {
				return rejectPasswordSession()
			}
			const credential = await findPasswordCredentialByUserId(
				options.credentials,
				principal.user.id,
			)
			if (
				credential?.sessionGeneration !== readPasswordSessionGeneration(session)
			) {
				return rejectPasswordSession()
			}
			if (
				(await retainPasswordSessionGeneration(
					options.credentials,
					credential,
				)) === null
			) {
				return rejectPasswordSession()
			}
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

/** Creates the six application-local handlers from one private auth state. */
export const createPasswordOperationHandlers = <
	TUser extends PasswordUserReference,
>(
	options: PasswordOperationHandlerOptions<TUser>,
): readonly [
	PluginOperationContribution<typeof passwordAuthOperations.signUp>,
	PluginOperationContribution<typeof passwordAuthOperations.login>,
	PluginOperationContribution<typeof passwordAuthOperations.logout>,
	PluginOperationContribution<typeof passwordAuthOperations.logoutEverywhere>,
	PluginOperationContribution<typeof passwordAuthOperations.changePassword>,
	PluginOperationContribution<typeof passwordAuthOperations.refresh>,
] => [
	createSignUpHandler(options),
	createLoginHandler(options),
	createLogoutHandler(options),
	createLogoutEverywhereHandler(options),
	createChangePasswordHandler(options),
	createRefreshHandler(options),
]
