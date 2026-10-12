import { randomUUID } from 'node:crypto'

import {
	rejectNotConfigured,
	rejectToken,
	rejectUnverifiedEmail,
	type AttemptSubject,
	type AuthServices,
	type AuthTokenPurpose,
	type AuthUserRecord,
} from '@ultimabase/auth-plugin'
import { FrameworkError, privateStore } from '@ultimabase/core'
import {
	contributeOperation,
	runAfterCommit,
	type PluginOperationContribution,
	type PluginOperationPublicDeclaration,
	type RequestContext,
} from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import { swapCredential, type CredentialCollection } from './credentials.js'
import type { ResolvedPasswordEmailOptions } from './email-options.js'
import { passwordEmailOperations } from './email-operations.js'
import {
	createCurrentPasswordVerifier,
	passwordMethodName,
	passwordSubject,
	tryNormalize,
	type PasswordTransaction,
} from './handlers.js'
import { normalizeEmail, normalizePassword } from './normalization.js'
import { rejectEmailChange, rejectPasswordChange } from './operations.js'
import { createNormalizedPasswordVerifier } from './password-hasher.js'
import type { ResolvedPasswordHashPolicy } from './password-policy.js'

type Operations = typeof passwordEmailOperations

interface PasswordEmailHandlerOptions {
	readonly credentials: () => CredentialCollection
	readonly email: ResolvedPasswordEmailOptions
	readonly policy: ResolvedPasswordHashPolicy
	readonly publicOperations: Readonly<
		Record<keyof Operations, PluginOperationPublicDeclaration>
	>
	readonly services: AuthServices
}

const accepted = immutableRecord({ accepted: true as const })

// Attempt namespaces beside logins (`password`): each request counts once.
const resetRequests = 'password-reset'
const verificationRequests = 'email-verification'

/** Delivers one message after commit: a failure is logged, never returned. */
const deliver = <TMessage>(
	send: (message: TMessage) => unknown,
	message: TMessage,
): void => {
	runAfterCommit(async () => {
		await send(message)
	})
}

const isUniqueViolation = (error: unknown): boolean =>
	error instanceof FrameworkError && error.code === 'UNIQUE_VIOLATION'

/**
 * Creates the handlers of password reset, email verification and email
 * change, and the sign-up and login steps verification adds.
 */
export const createPasswordEmailHandlers = (
	options: PasswordEmailHandlerOptions,
): Readonly<{
	afterSignUp: (
		userId: string,
		email: string,
		context: RequestContext,
	) => Promise<void>
	beforeLogin: (userId: string) => Promise<void>
	contributions: readonly [
		PluginOperationContribution<Operations['requestPasswordReset']>,
		PluginOperationContribution<Operations['resetPassword']>,
		PluginOperationContribution<Operations['requestEmailVerification']>,
		PluginOperationContribution<Operations['verifyEmail']>,
		PluginOperationContribution<Operations['requestEmailChange']>,
		PluginOperationContribution<Operations['confirmEmailChange']>,
	]
}> => {
	const { email, policy, services } = options
	const store = () => privateStore(options.credentials())
	const verifyCurrent = createCurrentPasswordVerifier(
		services,
		options.credentials,
		policy,
	)
	/** Failed token redemptions are counted per client address. */
	const tokenSubject = (
		context: RequestContext,
	): AttemptSubject | undefined => {
		const address = services.client(context)?.address
		return address === undefined
			? undefined
			: {
					address: undefined,
					identifier: `address:${address}`,
					method: 'token',
				}
	}
	/**
	 * Checks one token without using it; an invalid token is counted for the
	 * client address and rejected with `AUTH_INVALID_TOKEN`.
	 */
	const checkToken = async (
		purpose: AuthTokenPurpose,
		token: string,
		context: RequestContext,
		transaction: PasswordTransaction,
	) => {
		const subject = tokenSubject(context)
		const claim = await transaction(async () => {
			if (subject !== undefined) await services.checkAttempt(subject)
			return services.findToken(purpose, token)
		})
		if (claim === undefined) {
			if (subject !== undefined) {
				await transaction(() => services.countAttempt(subject))
			}
			return rejectToken()
		}
		return claim
	}
	/**
	 * Answers an email request the same whether the account exists or not:
	 * the same limiting, the same reads (a decoy for unknown addresses), and
	 * delivery after commit, outside the request.
	 */
	const requestByEmail = async (
		input: Readonly<{ email: string }>,
		context: RequestContext,
		transaction: PasswordTransaction,
		namespace: string,
		issue: (user: AuthUserRecord, address: string) => Promise<void>,
	) => {
		const address = tryNormalize(normalizeEmail, input.email)
		if (address === undefined) return accepted
		const subject = passwordSubject(services, context, address, namespace)
		await transaction(async () => {
			await services.checkAttempt(subject)
			await services.countAttempt(subject)
			const credential = await store().findUnique({
				where: { identifier: address },
			})
			const user = await services.readUser(credential?.userId ?? randomUUID())
			if (credential !== null && user?.email === address) {
				await issue(user, address)
			}
		})
		return accepted
	}
	const sendVerification = async (user: AuthUserRecord, address: string) => {
		const verification = email.verification
		if (verification === undefined || user.emailVerified === true) return
		const issued = await services.issueToken({
			email: address,
			expiresInMs: verification.expiresInMs,
			purpose: 'email-verification',
			userId: user.id,
		})
		deliver(verification.sendVerificationEmail, {
			email: address,
			expiresAt: issued.expiresAt,
			token: issued.token,
			user,
		})
	}
	return {
		afterSignUp: async (userId, address) => {
			if (email.verification === undefined) return
			const user = await services.readUser(userId)
			if (user !== undefined) await sendVerification(user, address)
		},
		beforeLogin: async (userId) => {
			if (email.verification?.requireVerifiedEmail !== true) return
			const user = await services.readUser(userId)
			if (user?.emailVerified !== true) rejectUnverifiedEmail()
		},
		contributions: [
			contributeOperation({
				operation: passwordEmailOperations.requestPasswordReset,
				public: options.publicOperations.requestPasswordReset,
				execute: ({ context, engine, input }) => {
					const reset = email.reset
					if (reset === undefined) return rejectNotConfigured('Password reset')
					return requestByEmail(
						input,
						context,
						(work) => engine.transaction(() => work()),
						resetRequests,
						async (user, address) => {
							const issued = await services.issueToken({
								email: address,
								expiresInMs: reset.expiresInMs,
								purpose: 'password-reset',
								userId: user.id,
							})
							deliver(reset.sendResetEmail, {
								email: address,
								expiresAt: issued.expiresAt,
								token: issued.token,
								user,
							})
						},
					)
				},
			}),
			// Reset: token checked first, Argon2 outside, then one atomic change.
			contributeOperation({
				operation: passwordEmailOperations.resetPassword,
				public: options.publicOperations.resetPassword,
				execute: async ({ context, engine, input }) => {
					const transaction: PasswordTransaction = (work) =>
						engine.transaction(() => work())
					await checkToken('password-reset', input.token, context, transaction)
					const newPassword = tryNormalize(normalizePassword, input.newPassword)
					if (newPassword === undefined) return rejectPasswordChange()
					const verifier = await createNormalizedPasswordVerifier(
						newPassword,
						policy,
					)
					return engine.transaction(async ({ context: active }) => {
						const claim = await services.consumeToken(
							'password-reset',
							input.token,
						)
						if (claim === undefined) return rejectToken()
						const credential = await store().findUnique({
							where: { userId: claim.userId },
						})
						// A token issued for a replaced email no longer resets.
						if (
							credential?.identifier !== claim.email ||
							(await swapCredential(options.credentials(), credential, {
								passwordVerifier: verifier.encoded,
								policyVersion: verifier.policyVersion,
							})) === null
						) {
							return rejectToken()
						}
						// The reset proves the mailbox: the email counts as verified.
						await services.markEmailVerified({
							context: active,
							email: claim.email,
							userId: claim.userId,
						})
						const address = services.client(context)?.address
						for (const namespace of [passwordMethodName, resetRequests]) {
							await services.resetAttempts({
								address,
								identifier: claim.email,
								method: namespace,
							})
						}
						await services.completePasswordReset(claim.userId, active)
						return immutableRecord({ reset: true as const })
					})
				},
			}),
			contributeOperation({
				operation: passwordEmailOperations.requestEmailVerification,
				public: options.publicOperations.requestEmailVerification,
				execute: ({ context, engine, input }) => {
					if (email.verification === undefined) {
						return rejectNotConfigured('Email verification')
					}
					return requestByEmail(
						input,
						context,
						(work) => engine.transaction(() => work()),
						verificationRequests,
						sendVerification,
					)
				},
			}),
			contributeOperation({
				operation: passwordEmailOperations.verifyEmail,
				public: options.publicOperations.verifyEmail,
				execute: async ({ context, engine, input }) => {
					await checkToken('email-verification', input.token, context, (work) =>
						engine.transaction(() => work()),
					)
					return engine.transaction(async ({ context: active }) => {
						const claim = await services.consumeToken(
							'email-verification',
							input.token,
						)
						const user =
							claim === undefined
								? undefined
								: await services.readUser(claim.userId)
						// A token issued for a replaced email no longer verifies.
						if (claim === undefined || user?.email !== claim.email) {
							return rejectToken()
						}
						await services.markEmailVerified({
							context: active,
							email: claim.email,
							userId: claim.userId,
						})
						return immutableRecord({ verified: true as const })
					})
				},
			}),
			// Request: the current password, then a token to the new address.
			contributeOperation({
				operation: passwordEmailOperations.requestEmailChange,
				public: options.publicOperations.requestEmailChange,
				execute: async ({ context, engine, input }) => {
					const emailChange = email.emailChange
					if (emailChange === undefined) {
						return rejectNotConfigured('Email change')
					}
					const transaction: PasswordTransaction = (work) =>
						engine.transaction(() => work())
					const { credential, subject } = await verifyCurrent(
						context,
						tryNormalize(normalizePassword, input.currentPassword),
						transaction,
						rejectEmailChange,
					)
					// Uniqueness is enforced at confirmation: no answer here tells
					// whether another account uses the address.
					const newEmail = tryNormalize(normalizeEmail, input.newEmail)
					if (newEmail === undefined || newEmail === credential.identifier) {
						return rejectEmailChange()
					}
					return engine.transaction(async ({ context: active }) => {
						await services.resetAttempts(subject)
						await services.markAuthenticated(active)
						const user = await services.readUser(credential.userId)
						if (user === undefined) return rejectEmailChange()
						const issued = await services.issueToken({
							email: newEmail,
							expiresInMs: emailChange.expiresInMs,
							purpose: 'email-change',
							userId: credential.userId,
						})
						deliver(emailChange.sendConfirmationEmail, {
							email: newEmail,
							expiresAt: issued.expiresAt,
							previousEmail: credential.identifier,
							token: issued.token,
							user,
						})
						return accepted
					})
				},
			}),
			// Confirmation: the new address proved; uniqueness is checked now,
			// and the unique indexes settle concurrent confirmations.
			contributeOperation({
				operation: passwordEmailOperations.confirmEmailChange,
				public: options.publicOperations.confirmEmailChange,
				execute: async ({ context, engine, input }) => {
					await checkToken('email-change', input.token, context, (work) =>
						engine.transaction(() => work()),
					)
					return engine.transaction(async ({ context: active }) => {
						const claim = await services.consumeToken(
							'email-change',
							input.token,
						)
						if (claim === undefined) return rejectToken()
						const credential = await store().findUnique({
							where: { userId: claim.userId },
						})
						if (credential === null) return rejectToken()
						if (
							(await store().findUnique({
								where: { identifier: claim.email },
							})) !== null
						) {
							return rejectEmailChange()
						}
						let previousEmail: string
						try {
							previousEmail = await services.changeEmail({
								context: active,
								email: claim.email,
								method: passwordMethodName,
								userId: claim.userId,
							})
							await store().update({
								data: { identifier: claim.email },
								where: { userId: claim.userId },
							})
						} catch (error: unknown) {
							if (isUniqueViolation(error)) return rejectEmailChange(error)
							throw error
						}
						const user = await services.readUser(claim.userId)
						const emailChange = email.emailChange
						if (user !== undefined && emailChange !== undefined) {
							deliver(emailChange.sendNoticeEmail, {
								email: previousEmail,
								newEmail: claim.email,
								user,
							})
						}
						return immutableRecord({ confirmed: true as const })
					})
				},
			}),
		],
	}
}
