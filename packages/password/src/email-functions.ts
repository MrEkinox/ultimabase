// password's email functions (D-117): `requestPasswordReset` and
// `resetPassword`, there when the application gives `sendEmail`.
import type { FunctionShape } from 'ultimabase'
import { allow, defineFunction } from 'ultimabase'
import type { State } from './core.ts'
import { method, setPassword } from './core.ts'
import { outputSchema, requestResetInput, resetPasswordInput } from './input.ts'
import { requestLimited } from './models.ts'
import type { Email, EmailKind } from './tokens.ts'
import { emailLimited, issueToken, redeemToken } from './tokens.ts'

/**
 * Runs `work` after the response, so its time tells nothing; a failure is
 * logged, and stopping the application waits for it.
 */
function later(state: State, work: () => Promise<void>): void {
	const task: Promise<void> = Promise.resolve()
		.then(work)
		.catch((error: unknown) => {
			state.logger.error({ err: error }, 'An email failed to send (D-117).')
		})
		.finally(() => {
			state.sending.delete(task)
		})
	state.sending.add(task)
}

/** The application's `sendEmail` (D-117). */
export type SendEmail = (email: Email) => Promise<void>

const done = outputSchema<boolean>({ type: 'boolean' })

/** The functions that send an email or redeem its token; each is public. */
export function emailFunctions(
	stateOf: () => State,
	sendEmail: SendEmail,
): readonly FunctionShape[] {
	/** Sends `userId` an email of `kind` to `to`, with a new token. */
	const sendToken = async (kind: EmailKind, userId: string, to: string) => {
		const token = await issueToken(userId, kind)
		await sendEmail({ kind, to, token, userId })
	}
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
				const { userId } = account
				if ((await emailLimited(userId)) !== undefined) return
				await sendToken('reset', userId, email)
			})
			return true
		},
	}).with({ access: allow.public })
	const resetPassword = defineFunction({
		name: 'resetPassword',
		input: resetPasswordInput,
		output: done,
		run: async ({ input: { input } }) => {
			const userId = await redeemToken(input.token, 'reset')
			await setPassword(stateOf(), userId, input.password)
			return true
		},
	}).with({ access: allow.public })
	return [requestPasswordReset, resetPassword]
}
