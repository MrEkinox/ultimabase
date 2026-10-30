// password's email functions (D-117, D-162): `requestPasswordReset`,
// `resetPassword`, `verifyEmail`, `sendVerificationEmail`,
// `requestEmailChange` and `confirmEmailChange`, there when the application
// gives `sendEmail`.
import type { FunctionShape } from 'ultimabase'
import {
	allow,
	defineFunction,
	master,
	PublicError,
	transaction,
} from 'ultimabase'
import type { State } from './core.ts'
import { attemptOf, checkCurrent, method, setPassword } from './core.ts'
import {
	confirmEmailChangeInput,
	outputSchema,
	requestEmailChangeInput,
	requestResetInput,
	resetPasswordInput,
	verifyEmailInput,
} from './input.ts'
import { requestLimited } from './models.ts'
import type { Email, EmailKind } from './tokens.ts'
import { emailLimited, issueToken, redeemToken } from './tokens.ts'

/**
 * Runs `work` after the response, so its time tells nothing; a failure is
 * logged, and stopping the application waits for it.
 */
export function later(state: State, work: () => Promise<void>): void {
	const task: Promise<void> = Promise.resolve()
		.then(work)
		.catch((error: unknown) => {
			state.logger.error({ err: error }, 'An email failed to send.')
		})
		.finally(() => {
			state.sending.delete(task)
		})
	state.sending.add(task)
}

/** The application's `sendEmail` (D-117). */
export type SendEmail = (email: Email) => Promise<void>

/**
 * Sends `userId` an email of `kind` to `to`, with a new token; past the
 * account's hourly limit, the refusal instead.
 */
export type Mailer = (
	kind: EmailKind,
	userId: string,
	to: string,
) => Promise<PublicError | undefined>

export const mailerOf =
	(sendEmail: SendEmail): Mailer =>
	async (kind, userId, to) => {
		const refused = await emailLimited(userId)
		if (refused !== undefined) return refused
		const token = await issueToken(userId, kind, to)
		await sendEmail({ kind, to, token, userId })
		return undefined
	}

const done = outputSchema<boolean>({ type: 'boolean' })
const M = { as: master }

/** Marks `userId`'s email verified: the user received an email (D-117). */
async function verify(state: State, userId: string): Promise<void> {
	const where = { id: userId }
	await state.users.queries.update({ where, data: { emailVerified: true } }, M)
}

/** The functions that send an email or redeem its token; each is public. */
export function emailFunctions(
	stateOf: () => State,
	mail: Mailer,
): readonly FunctionShape[] {
	const requestPasswordReset = defineFunction({
		name: 'requestPasswordReset',
		input: requestResetInput,
		output: done,
		run: async ({ input: { input }, client }) => {
			const state = stateOf()
			if (client !== undefined) await requestLimited('reset', client.address)
			const { email } = input
			// The same answer, and no wait, whether the email has an account.
			later(state, async () => {
				const account = await state.auth.accountOf(method, email)
				if (account === undefined) return
				await mail('reset', account.userId, email)
			})
			return true
		},
	}).with({ access: allow.public })
	const resetPassword = defineFunction({
		name: 'resetPassword',
		input: resetPasswordInput,
		output: done,
		run: async ({ input: { input } }) => {
			const state = stateOf()
			const { userId } = await redeemToken(input.token, 'reset')
			await setPassword(state, userId, input.password)
			await verify(state, userId)
			return true
		},
	}).with({ access: allow.public })
	const verifyEmail = defineFunction({
		name: 'verifyEmail',
		input: verifyEmailInput,
		output: done,
		run: async ({ input: { input } }) => {
			const { userId } = await redeemToken(input.token, 'verify')
			await verify(stateOf(), userId)
			return true
		},
	}).with({ access: allow.public })
	const sendVerificationEmail = defineFunction({
		name: 'sendVerificationEmail',
		output: done,
		run: async ({ caller, client }) => {
			if (caller.kind !== 'user') {
				throw new PublicError(
					'UNAUTHENTICATED',
					'sendVerificationEmail needs a signed-in user.',
				)
			}
			if (client !== undefined) await requestLimited('verify', client.address)
			const { user } = caller
			// The user's row, read as Master, holds the field password adds.
			if (Reflect.get(user, 'emailVerified') === true) return true
			const to = await stateOf().auth.subjectOf(user.id, method)
			// A user signed in another way has no email to verify.
			if (to === undefined) return true
			const refused = await mail('verify', user.id, to)
			if (refused !== undefined) throw refused
			return true
		},
	}).with({ access: allow.public })
	return [
		requestPasswordReset,
		resetPassword,
		verifyEmail,
		sendVerificationEmail,
		...emailChangeFunctions(stateOf, mail),
	]
}

/** `requestEmailChange` and `confirmEmailChange` (D-162). */
function emailChangeFunctions(
	stateOf: () => State,
	mail: Mailer,
): readonly FunctionShape[] {
	const requestEmailChange = defineFunction({
		name: 'requestEmailChange',
		input: requestEmailChangeInput,
		output: done,
		run: async ({ input: { input }, caller, client }) => {
			if (caller.kind !== 'user') {
				throw new PublicError(
					'UNAUTHENTICATED',
					'requestEmailChange needs a signed-in user.',
				)
			}
			const { id } = caller.user
			await checkCurrent(id, input.currentPassword, attemptOf(id, client))
			const { newEmail } = input
			// The caller proved the password: telling it is no enumeration.
			if ((await stateOf().auth.accountOf(method, newEmail)) !== undefined) {
				throw new PublicError('UNIQUE_VIOLATION', 'This email has an account.')
			}
			const refused = await mail('emailChange', id, newEmail)
			if (refused !== undefined) throw refused
			return true
		},
	}).with({ access: allow.public })
	const confirmEmailChange = defineFunction({
		name: 'confirmEmailChange',
		input: confirmEmailChangeInput,
		output: done,
		run: async ({ input: { input } }) => {
			const { users } = stateOf()
			// A taken email undoes the redeem too: the link works until it expires.
			await transaction(async () => {
				const { userId, email } = await redeemToken(input.token, 'emailChange')
				const data = { email, emailVerified: true }
				await users.queries.update({ where: { id: userId }, data }, M)
			})
			return true
		},
	}).with({ access: allow.public })
	return [requestEmailChange, confirmEmailChange]
}
