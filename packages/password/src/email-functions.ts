// password's email functions (D-117, D-162): `requestPasswordReset`,
// `resetPassword`, `verifyEmail`, `sendVerificationEmail`,
// `requestEmailChange` and `confirmEmailChange`, there when the application
// gives `sendEmail`.
import { signedInRun } from '@ultimabase/auth'
import type { FunctionShape } from 'ultimabase'
import { allow, defineFunction } from 'ultimabase'
import type { State } from './core.ts'
import { attemptOf, checkCurrent } from './core.ts'
import type { Mailer } from './email-flows.ts'
import {
	confirmChange,
	later,
	requestChange,
	requestReset,
	reset,
	sendVerification,
	verifyWith,
} from './email-flows.ts'
import {
	confirmEmailChangeInput,
	outputSchema,
	requestEmailChangeInput,
	requestResetInput,
	resetPasswordInput,
	verifyEmailInput,
} from './input.ts'
import { requestLimited } from './models.ts'

const done = outputSchema<boolean>({ type: 'boolean' })

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
			// The same answer, and no wait, whether the email has an account;
			// past the account's limit, nothing is sent.
			later(state, async () => {
				await requestReset(state, mail, input.email)
			})
			return true
		},
	}).with({ access: allow.public })
	const resetPassword = defineFunction({
		name: 'resetPassword',
		input: resetPasswordInput,
		output: done,
		run: async ({ input: { input } }) => {
			await reset(stateOf(), input.token, input.password)
			return true
		},
	}).with({ access: allow.public })
	const verifyEmail = defineFunction({
		name: 'verifyEmail',
		input: verifyEmailInput,
		output: done,
		run: async ({ input: { input } }) => {
			await verifyWith(stateOf(), input.token)
			return true
		},
	}).with({ access: allow.public })
	const sendVerificationEmail = defineFunction({
		name: 'sendVerificationEmail',
		output: done,
		run: signedInRun(async ({ user, client }) => {
			if (client !== undefined) await requestLimited('verify', client.address)
			// The user's row, read as Master, holds the field password adds.
			const verified = Reflect.get(user, 'emailVerified') === true
			await sendVerification(stateOf(), mail, user.id, verified)
			return true
		}),
	}).with({ access: allow.public })
	const requestEmailChange = defineFunction({
		name: 'requestEmailChange',
		input: requestEmailChangeInput,
		output: done,
		run: signedInRun(async ({ input: { input }, user, client }) => {
			const { id } = user
			await checkCurrent(id, input.currentPassword, attemptOf(id, client))
			// The caller proved the password: telling a taken email is no
			// enumeration.
			await requestChange(stateOf(), mail, id, input.newEmail)
			return true
		}),
	}).with({ access: allow.public })
	const confirmEmailChange = defineFunction({
		name: 'confirmEmailChange',
		input: confirmEmailChangeInput,
		output: done,
		run: async ({ input: { input } }) => {
			await confirmChange(stateOf(), input.token)
			return true
		},
	}).with({ access: allow.public })
	return [
		requestPasswordReset,
		resetPassword,
		verifyEmail,
		sendVerificationEmail,
		requestEmailChange,
		confirmEmailChange,
	]
}
