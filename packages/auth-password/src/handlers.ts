import {
	rejectCredentials,
	rejectSignUp,
	type AttemptSubject,
	type AuthServices,
} from '@ultimabase/auth-plugin'
import { FrameworkError, privateStore } from '@ultimabase/core'
import {
	contributeOperation,
	type PluginOperationContribution,
	type PluginOperationPublicDeclaration,
	type RequestContext,
} from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import { swapCredential, type CredentialCollection } from './credentials.js'
import { normalizePassword } from './normalization.js'
import { passwordOperations, rejectPasswordChange } from './operations.js'
import {
	createNormalizedPasswordVerifier,
	verifyNormalizedPasswordOrDummy,
} from './password-hasher.js'
import type { ResolvedPasswordHashPolicy } from './password-policy.js'

/** The method name stored on sessions and linked accounts. */
export const passwordMethodName = 'password'

type Operations = typeof passwordOperations

/** The identifier fields a password method can use. */
export type PasswordIdentifier = 'email' | 'username'

interface PasswordHandlerOptions {
	readonly credentials: () => CredentialCollection
	readonly identifier: PasswordIdentifier
	readonly normalizeIdentifier: (value: unknown) => string
	readonly policy: ResolvedPasswordHashPolicy
	readonly publicOperations: Readonly<
		Record<keyof Operations, PluginOperationPublicDeclaration>
	>
	readonly services: AuthServices
}

const tryNormalize = (
	normalize: (value: unknown) => string,
	value: unknown,
): string | undefined => {
	try {
		return normalize(value)
	} catch {
		return undefined
	}
}

/** Creates the four handlers of one password method. */
export const createPasswordHandlers = (
	options: PasswordHandlerOptions,
): readonly [
	PluginOperationContribution<Operations['signUp']>,
	PluginOperationContribution<Operations['login']>,
	PluginOperationContribution<Operations['changePassword']>,
	PluginOperationContribution<Operations['reauthenticate']>,
] => {
	const { identifier, normalizeIdentifier, policy, services } = options
	const store = () => privateStore(options.credentials())
	const subjectFor = (
		context: RequestContext,
		key: string,
	): AttemptSubject => ({
		address: services.client(context)?.address,
		identifier: key,
		method: passwordMethodName,
	})
	/** Verifies the current password of an authenticated user under attempt limits. */
	const verifyCurrent = async (
		context: RequestContext,
		password: string | undefined,
		transaction: <TResult>(work: () => Promise<TResult>) => Promise<TResult>,
		reject: () => never,
	) => {
		const { userId } = services.requireAuthenticated(context)
		const subject = subjectFor(context, `user:${userId}`)
		await services.assertAttemptAllowed(subject, context, transaction)
		const credential = await store().findUnique({ where: { userId } })
		const verification = await verifyNormalizedPasswordOrDummy(
			password ?? '',
			credential === null || password === undefined
				? null
				: {
						encoded: credential.passwordVerifier,
						policyVersion: credential.policyVersion,
					},
			policy,
		)
		if (credential === null || !verification.matches) {
			await transaction(() => services.recordFailedAttempt(subject, context))
			return reject()
		}
		return { credential, subject }
	}
	return [
		// Sign-up: hash first, then create the User, credential and session atomically.
		contributeOperation({
			operation: passwordOperations.signUp,
			public: options.publicOperations.signUp,
			execute: async ({ engine, input }) => {
				const { password: rawPassword, ...data } = input
				const normalizedIdentifier = tryNormalize(
					normalizeIdentifier,
					data[identifier],
				)
				const password = tryNormalize(normalizePassword, rawPassword)
				if (normalizedIdentifier === undefined || password === undefined) {
					return rejectSignUp(
						[
							...(normalizedIdentifier === undefined ? [identifier] : []),
							...(password === undefined ? ['password'] : []),
						].sort(),
					)
				}
				const verifier = await createNormalizedPasswordVerifier(
					password,
					policy,
				)
				return engine.transaction(async ({ context }) => {
					const userId = await services.createUser(
						{ ...data, [identifier]: normalizedIdentifier },
						context,
					)
					try {
						await store().insert({
							data: {
								identifier: normalizedIdentifier,
								passwordVerifier: verifier.encoded,
								policyVersion: verifier.policyVersion,
								userId,
							},
						})
					} catch (error: unknown) {
						// The identifier is taken: one opaque rejection.
						if (
							error instanceof FrameworkError &&
							error.code === 'UNIQUE_VIOLATION'
						) {
							return rejectSignUp()
						}
						throw error
					}
					await services.linkAccount(userId, {
						email: identifier === 'email' ? normalizedIdentifier : null,
						method: passwordMethodName,
						providerUserId: userId,
					})
					return services.signIn({
						context,
						method: passwordMethodName,
						signUp: true,
						userId,
					})
				})
			},
		}),
		// Login: every rejection is identical, including for unknown identifiers.
		contributeOperation({
			operation: passwordOperations.login,
			public: options.publicOperations.login,
			execute: async ({ context, engine, input }) => {
				const raw: unknown = Reflect.get(input, identifier)
				const normalized = tryNormalize(normalizeIdentifier, raw)
				const password = tryNormalize(normalizePassword, input.password)
				if (normalized === undefined) return rejectCredentials()
				const transaction = <TResult>(work: () => Promise<TResult>) =>
					engine.transaction(() => work())
				const subject = subjectFor(context, normalized)
				await services.assertAttemptAllowed(subject, context, transaction)
				const credential = await store().findUnique({
					where: { identifier: normalized },
				})
				// Unknown identifiers still pay for one full dummy verification.
				const verification = await verifyNormalizedPasswordOrDummy(
					password ?? '',
					credential === null || password === undefined
						? null
						: {
								encoded: credential.passwordVerifier,
								policyVersion: credential.policyVersion,
							},
					policy,
				)
				if (credential === null || !verification.matches) {
					await transaction(() =>
						services.recordFailedAttempt(subject, context),
					)
					return rejectCredentials()
				}
				const upgraded =
					verification.requiresUpgrade && password !== undefined
						? await createNormalizedPasswordVerifier(password, policy)
						: undefined
				return engine.transaction(async ({ context: active }) => {
					if (
						upgraded !== undefined &&
						(await swapCredential(options.credentials(), credential, {
							passwordVerifier: upgraded.encoded,
							policyVersion: upgraded.policyVersion,
						})) === null
					) {
						return rejectCredentials()
					}
					return services.signIn({
						context: active,
						method: passwordMethodName,
						subject,
						userId: credential.userId,
					})
				})
			},
		}),
		// Change password: proves the current one, then revokes other sessions.
		contributeOperation({
			operation: passwordOperations.changePassword,
			public: options.publicOperations.changePassword,
			execute: async ({ context, engine, input }) => {
				const transaction = <TResult>(work: () => Promise<TResult>) =>
					engine.transaction(() => work())
				const newPassword = tryNormalize(normalizePassword, input.newPassword)
				const { credential, subject } = await verifyCurrent(
					context,
					tryNormalize(normalizePassword, input.currentPassword),
					transaction,
					rejectPasswordChange,
				)
				if (newPassword === undefined) return rejectPasswordChange()
				const verifier = await createNormalizedPasswordVerifier(
					newPassword,
					policy,
				)
				return engine.transaction(async ({ context: active }) => {
					if (
						(await swapCredential(options.credentials(), credential, {
							passwordVerifier: verifier.encoded,
							policyVersion: verifier.policyVersion,
						})) === null
					) {
						return rejectPasswordChange()
					}
					await services.resetAttempts(subject)
					await services.markAuthenticated(active)
					await services.revokeOtherSessionsOnPasswordChange(active)
					return immutableRecord({ changed: true as const })
				})
			},
		}),
		// Reauthenticate: a new proof of the password for sensitive operations.
		contributeOperation({
			operation: passwordOperations.reauthenticate,
			public: options.publicOperations.reauthenticate,
			execute: async ({ context, engine, input }) => {
				const transaction = <TResult>(work: () => Promise<TResult>) =>
					engine.transaction(() => work())
				const { subject } = await verifyCurrent(
					context,
					tryNormalize(normalizePassword, input.password),
					transaction,
					rejectCredentials,
				)
				return engine.transaction(async ({ context: active }) => {
					await services.resetAttempts(subject)
					await services.markAuthenticated(active)
					return immutableRecord({ reauthenticated: true as const })
				})
			},
		}),
	]
}

/** Deletes the verifier of a user whose password method is unlinked. */
export const deletePasswordCredential = async (
	credentials: CredentialCollection,
	userId: string,
): Promise<void> => {
	await privateStore(credentials).delete({ where: { userId } })
}
