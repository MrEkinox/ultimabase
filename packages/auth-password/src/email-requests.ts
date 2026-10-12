import { randomUUID } from 'node:crypto'

import {
	rejectToken,
	type AttemptSubject,
	type AuthServices,
	type AuthTokenClaim,
	type AuthTokenPurpose,
	type AuthUserRecord,
} from '@ultimabase/auth-plugin'
import { privateStore } from '@ultimabase/core'
import { runAfterCommit, type RequestContext } from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import type { CredentialCollection } from './credentials.js'
import {
	passwordSubject,
	tryNormalize,
	type PasswordTransaction,
} from './handlers.js'
import { normalizeEmail } from './normalization.js'
import type { PasswordRequestAcceptedResult } from './email-operations.js'

/** The answer of every accepted request. */
export const accepted: PasswordRequestAcceptedResult = immutableRecord({
	accepted: true as const,
})

/** Delivers one message after commit: a failure is logged, never returned. */
export const deliver = <TMessage>(
	send: (message: TMessage) => unknown,
	message: TMessage,
): void => {
	runAfterCommit(async () => {
		await send(message)
	})
}

/** The steps the email operations share. */
export interface EmailRequests {
	/**
	 * Checks one token without using it; an invalid token is counted for the
	 * client address and rejected with `AUTH_INVALID_TOKEN`.
	 */
	readonly checkToken: (
		purpose: AuthTokenPurpose,
		token: string,
		context: RequestContext,
		transaction: PasswordTransaction,
	) => Promise<AuthTokenClaim>
	/**
	 * Answers an email request the same whether the account exists or not:
	 * the same limiting, the same reads (a decoy for unknown addresses), and
	 * delivery after commit, outside the request. `namespace` names the
	 * attempt counters, such as `password-reset`.
	 */
	readonly requestByEmail: (
		input: Readonly<{ email: string }>,
		context: RequestContext,
		transaction: PasswordTransaction,
		namespace: string,
		issue: (user: AuthUserRecord, address: string) => Promise<void>,
	) => Promise<PasswordRequestAcceptedResult>
}

/** Creates the shared steps of the email operations. */
export const createEmailRequests = (
	services: AuthServices,
	credentials: () => CredentialCollection,
): EmailRequests => {
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
	return {
		checkToken: async (purpose, token, context, transaction) => {
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
		},
		requestByEmail: async (input, context, transaction, namespace, issue) => {
			const address = tryNormalize(normalizeEmail, input.email)
			if (address === undefined) return accepted
			const subject = passwordSubject(services, context, address, namespace)
			await transaction(async () => {
				await services.checkAttempt(subject)
				await services.countAttempt(subject)
				const credential = await privateStore(credentials()).findUnique({
					where: { identifier: address },
				})
				const user = await services.readUser(credential?.userId ?? randomUUID())
				if (credential !== null && user?.email === address) {
					await issue(user, address)
				}
			})
			return accepted
		},
	}
}
