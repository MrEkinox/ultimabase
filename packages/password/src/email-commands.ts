// password's email flows as commands on the user model (D-198): the code
// the functions run, for server code, which has no client and waits for the
// email.
import type { QueryOptions } from 'ultimabase'
import { master } from 'ultimabase'
import type { State } from './core.ts'
import { selfOrMaster } from './core.ts'
import type { Mailer } from './email-flows.ts'
import {
	confirmChange,
	mailerOf,
	requestChange,
	requestReset,
	reset,
	sendVerification,
	verifyWith,
} from './email-flows.ts'
import { emailOf, passwordOf, valid } from './input.ts'

type Token = { readonly token: string }

/** password's email commands (D-198); those that send need `sendEmail`. */
export interface EmailCommands {
	/** Sends the email's account a reset link, once sent; nothing to an email without one. */
	requestPasswordReset(
		args: { readonly email: string },
		options?: QueryOptions,
	): Promise<void>
	/** Sets the password a reset link's user chose, and verifies the email. */
	resetPassword(
		args: Token & { readonly password: string },
		options?: QueryOptions,
	): Promise<void>
	/** Verifies the email a verification link went to. */
	verifyEmail(args: Token, options?: QueryOptions): Promise<void>
	/** Sends the user a verification link, as Master or as the user. */
	sendVerificationEmail(
		args: { readonly id: string },
		options?: QueryOptions,
	): Promise<void>
	/**
	 * Sends the new email the link that moves the user to it, as Master or
	 * as the user. It takes no current password: check the user's intent
	 * first, as requestEmailChange does with `User.checkPassword`.
	 */
	requestEmailChange(
		args: { readonly id: string; readonly newEmail: string },
		options?: QueryOptions,
	): Promise<void>
	/** Writes the email an email-change link went to, verified. */
	confirmEmailChange(args: Token, options?: QueryOptions): Promise<void>
}

const M = { as: master }

/** The mailer of the application's `sendEmail`; without one, its mistake. */
function mailerIn(state: State, command: string): Mailer {
	if (state.sendEmail === undefined) {
		throw new Error(`User.${command} needs passwordPlugin({ sendEmail }).`)
	}
	return mailerOf(state.sendEmail)
}

export const emailCommands = (stateOf: () => State): EmailCommands => ({
	requestPasswordReset: async ({ email }) => {
		const state = stateOf()
		const mail = mailerIn(state, 'requestPasswordReset')
		const to = valid(emailOf, email, 'email')
		const refused = await requestReset(state, mail, to)
		if (refused !== undefined) throw refused
	},
	resetPassword: async ({ token, password }) => {
		await reset(stateOf(), token, valid(passwordOf, password, 'password'))
	},
	verifyEmail: async ({ token }) => {
		await verifyWith(stateOf(), token)
	},
	sendVerificationEmail: async ({ id }, options) => {
		selfOrMaster(options, id, 'sendVerificationEmail')
		const state = stateOf()
		const mail = mailerIn(state, 'sendVerificationEmail')
		const user = await state.users.queries.findUnique({ where: { id } }, M)
		const verified = user?.emailVerified === true
		await sendVerification(state, mail, id, verified)
	},
	requestEmailChange: async ({ id, newEmail }, options) => {
		selfOrMaster(options, id, 'requestEmailChange')
		const state = stateOf()
		const mail = mailerIn(state, 'requestEmailChange')
		const to = valid(emailOf, newEmail, 'newEmail')
		await requestChange(state, mail, id, to)
	},
	confirmEmailChange: async ({ token }) => {
		await confirmChange(stateOf(), token)
	},
})
