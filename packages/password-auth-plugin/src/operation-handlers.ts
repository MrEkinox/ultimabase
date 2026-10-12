import { immutableRecord } from '@ultimabase/shared'

import {
	findPasswordCredentialByUserId,
	findPasswordCredentialByUsername,
	insertPasswordCredential,
	retainPasswordSessionGeneration,
	swapPasswordCredential,
	upgradePasswordCredential,
	type CreatePasswordCredentialInput,
	type PasswordCredentialCollection,
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
import { passwordAuthPublicOperations } from './public-operations.js'
import {
	createNormalizedPasswordVerifier,
	verifyNormalizedPasswordOrDummy,
} from './password-hasher.js'
import type { ResolvedPasswordHashPolicy } from './password-policy.js'
import type { PasswordPrincipal } from './principal.js'
import type { ResolvedPasswordSessionPolicy } from './session-policy.js'
import {
	passwordPrincipal,
	passwordSession,
	readPasswordSessionGeneration,
	type PasswordSession,
} from './session.js'
import {
	advanceCurrentPasswordSessionGeneration,
	issuePasswordSession,
	revokePasswordSession,
	rotatePasswordSession,
	type PasswordSessionCollection,
} from './sessions.js'
import {
	isRejectedSignUpFailure,
	restorePasswordSignUpValue,
} from './sign-up-input.js'
import { readPasswordAuthenticationResult } from './authentication-result.js'
import type { PasswordUserReference } from './user-schema.js'
import {
	type RequestContext,
	contributeOperation,
	type PluginOperationContribution,
} from '@ultimabase/core/plugin'

interface PasswordOperationHandlerOptions<TUser extends PasswordUserReference> {
	readonly credentials: PasswordCredentialCollection
	readonly passwordPolicy: ResolvedPasswordHashPolicy
	readonly sessionPolicy: ResolvedPasswordSessionPolicy
	readonly sessions: PasswordSessionCollection
	readonly user: TUser
}

/** Normalizes public credentials, mapping every failure to one uniform rejection. */
const normalizeCredentials = (
	input: Readonly<{ readonly password: string; readonly username: string }>,
	reject: () => never,
): Readonly<{ readonly password: string; readonly username: string }> => {
	try {
		return immutableRecord({
			password: normalizePasswordInput(input.password),
			username: normalizePasswordUsername(input.username),
		})
	} catch {
		return reject()
	}
}

const unchangedCredential = (
	left: CreatePasswordCredentialInput,
	right: CreatePasswordCredentialInput,
): boolean =>
	left.passwordVerifier === right.passwordVerifier &&
	left.policyVersion === right.policyVersion &&
	left.sessionGeneration === right.sessionGeneration &&
	left.userId === right.userId &&
	left.username === right.username

/** Reads the authenticated identity that account-scoped operations require. */
const requireAuthenticated = (
	context: RequestContext,
): Readonly<{ principal: PasswordPrincipal; session: PasswordSession }> => {
	const principal = context.getValue(passwordPrincipal)
	const session = context.getValue(passwordSession)
	if (principal === undefined || session === undefined) {
		return rejectPasswordSession()
	}
	return { principal, session }
}

/** Reads the credential only while the session's account generation is current. */
const requireCurrentCredential = async (
	credentials: PasswordCredentialCollection,
	{ principal, session }: ReturnType<typeof requireAuthenticated>,
): Promise<CreatePasswordCredentialInput> => {
	const credential = await findPasswordCredentialByUserId(
		credentials,
		principal.user.id,
	)
	if (
		credential?.sessionGeneration !== readPasswordSessionGeneration(session)
	) {
		return rejectPasswordSession()
	}
	return credential
}

/** Reads the id of a created User from its plain result (ADR-0310). */
const readCreatedUserId = (model: unknown): string => {
	const id: unknown =
		typeof model === 'object' && model !== null
			? Reflect.get(model, 'id')
			: undefined
	if (typeof id !== 'string') {
		throw new TypeError('Password Auth User creation returned no id')
	}
	return id
}

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
] => {
	const { credentials, passwordPolicy, sessionPolicy, sessions, user } = options
	return [
		// Sign-up: hash first, then create the User, credential, and session atomically.
		contributeOperation({
			operation: passwordAuthOperations.signUp,
			public: passwordAuthPublicOperations.signUp,
			execute: async ({ engine, input }) => {
				const { password, username } = normalizeCredentials(
					input,
					rejectPasswordSignUp,
				)
				const verifier = await createNormalizedPasswordVerifier(
					password,
					passwordPolicy,
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
						const created = await user.createOne(
							{ data: { ...data, username } },
							transaction.context.access.mode === 'master'
								? undefined
								: { useMasterKey: true },
						)
						const userId = readCreatedUserId(created)
						await insertPasswordCredential(credentials, {
							passwordVerifier: verifier.encoded,
							policyVersion: verifier.policyVersion,
							sessionGeneration: 0,
							userId,
							username,
						})
						const session = await issuePasswordSession(
							sessions,
							userId,
							0,
							sessionPolicy,
						)
						return readPasswordAuthenticationResult(
							user,
							userId,
							session,
							transaction.context,
						)
					})
				} catch (error: unknown) {
					if (isRejectedSignUpFailure(error, user))
						return rejectPasswordSignUp()
					throw error
				}
			},
		}),
		// Login: every rejection is identical, including for unknown usernames.
		contributeOperation({
			operation: passwordAuthOperations.login,
			public: passwordAuthPublicOperations.login,
			execute: async ({ engine, input }) => {
				const { password, username } = normalizeCredentials(
					input,
					rejectPasswordCredentials,
				)
				const credential = await findPasswordCredentialByUsername(
					credentials,
					username,
				)
				// Unknown usernames still pay for one full dummy verification.
				const verification = await verifyNormalizedPasswordOrDummy(
					password,
					credential === null
						? null
						: {
								encoded: credential.passwordVerifier,
								policyVersion: credential.policyVersion,
							},
					passwordPolicy,
				)
				if (credential === null || !verification.matches) {
					return rejectPasswordCredentials()
				}
				const upgraded = verification.requiresUpgrade
					? await createNormalizedPasswordVerifier(password, passwordPolicy)
					: undefined
				return engine.transaction(async (transaction) => {
					// The verified credential must still be current inside the transaction.
					const current = await findPasswordCredentialByUsername(
						credentials,
						username,
					)
					if (current === null || !unchangedCredential(current, credential)) {
						return rejectPasswordCredentials()
					}
					if (
						upgraded !== undefined &&
						(await upgradePasswordCredential(credentials, current, {
							passwordVerifier: upgraded.encoded,
							policyVersion: upgraded.policyVersion,
						})) === null
					) {
						return rejectPasswordCredentials()
					}
					const session = await issuePasswordSession(
						sessions,
						current.userId,
						current.sessionGeneration,
						sessionPolicy,
					)
					return readPasswordAuthenticationResult(
						user,
						current.userId,
						session,
						transaction.context,
					)
				})
			},
		}),
		// Logout: revokes only the unchanged current session.
		contributeOperation({
			operation: passwordAuthOperations.logout,
			public: passwordAuthPublicOperations.logout,
			execute: async ({ context }) => {
				const session = context.getValue(passwordSession)
				if (
					session === undefined ||
					!(await revokePasswordSession(sessions, session))
				) {
					return rejectPasswordSession()
				}
				return immutableRecord({ revoked: true as const })
			},
		}),
		// Logout everywhere: advancing the account generation invalidates every session.
		contributeOperation({
			operation: passwordAuthOperations.logoutEverywhere,
			public: passwordAuthPublicOperations.logoutEverywhere,
			execute: async ({ context }) => {
				const credential = await requireCurrentCredential(
					credentials,
					requireAuthenticated(context),
				)
				// Advancing the account generation invalidates every issued session.
				if (
					(await swapPasswordCredential(credentials, credential, {
						sessionGeneration: credential.sessionGeneration + 1,
					})) === null
				) {
					return rejectPasswordSession()
				}
				return immutableRecord({ revoked: true as const })
			},
		}),
		// Change password: the current session moves to the new account generation.
		contributeOperation({
			operation: passwordAuthOperations.changePassword,
			public: passwordAuthPublicOperations.changePassword,
			execute: async ({ context, engine, input }) => {
				const authenticated = requireAuthenticated(context)
				let currentPassword: string
				let newPassword: string
				try {
					currentPassword = normalizePasswordInput(input.currentPassword)
					newPassword = normalizePasswordInput(input.newPassword)
				} catch {
					return rejectPasswordChange()
				}
				const credential = await requireCurrentCredential(
					credentials,
					authenticated,
				)
				const verification = await verifyNormalizedPasswordOrDummy(
					currentPassword,
					{
						encoded: credential.passwordVerifier,
						policyVersion: credential.policyVersion,
					},
					passwordPolicy,
				)
				if (!verification.matches) return rejectPasswordChange()
				const verifier = await createNormalizedPasswordVerifier(
					newPassword,
					passwordPolicy,
				)
				return engine.transaction(async () => {
					const current = await findPasswordCredentialByUserId(
						credentials,
						credential.userId,
					)
					if (current?.sessionGeneration !== credential.sessionGeneration) {
						return rejectPasswordSession()
					}
					if (!unchangedCredential(current, credential)) {
						return rejectPasswordChange()
					}
					// The new generation revokes every other session; only the current
					// session moves along with it.
					const sessionGeneration = current.sessionGeneration + 1
					if (
						(await swapPasswordCredential(credentials, current, {
							passwordVerifier: verifier.encoded,
							policyVersion: verifier.policyVersion,
							sessionGeneration,
						})) === null ||
						!(await advanceCurrentPasswordSessionGeneration(
							sessions,
							authenticated.session,
							sessionGeneration,
						))
					) {
						return rejectPasswordSession()
					}
					return immutableRecord({ changed: true as const })
				})
			},
		}),
		// Refresh: rotates the current session token and rereads the profile.
		contributeOperation({
			operation: passwordAuthOperations.refresh,
			public: passwordAuthPublicOperations.refresh,
			execute: async ({ context }) => {
				const authenticated = requireAuthenticated(context)
				const credential = await requireCurrentCredential(
					credentials,
					authenticated,
				)
				// Locks the account generation so a concurrent invalidation cannot interleave.
				if (
					(await retainPasswordSessionGeneration(credentials, credential)) ===
					null
				) {
					return rejectPasswordSession()
				}
				const rotated = await rotatePasswordSession(
					sessions,
					authenticated.session,
					sessionPolicy,
				)
				if (rotated === undefined) return rejectPasswordSession()
				return readPasswordAuthenticationResult(
					user,
					rotated.userId,
					rotated,
					context,
				)
			},
		}),
	]
}
