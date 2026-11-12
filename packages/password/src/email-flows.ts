// What password's email functions and commands share (D-117, D-162, D-198):
// sending an email with its token, and redeeming one.
import type { Logger, Register, UserOf } from 'ultimabase'
import { master, PublicError, transaction } from 'ultimabase'
import { appLogger, logFailure } from 'ultimabase/internal'
import type { State } from './core.ts'
import { checkNewFor, method, setPassword } from './core.ts'
import { hashPassword } from './hash.ts'
import type { Email, EmailKind, Unsent } from './tokens.ts'
import { emailLimited, invalidLink, issueToken, redeemToken } from './tokens.ts'

/**
 * Runs `work` after the response, so its time tells nothing; a failure is
 * logged, and stopping the application waits for it.
 */
export function later(state: State, work: () => Promise<void>): void {
	const task: Promise<void> = Promise.resolve()
		.then(work)
		.catch((error: unknown) => {
			logFailure(state.logger, error, 'An email failed to send.')
		})
		.finally(() => {
			state.sending.delete(task)
		})
	state.sending.add(task)
}

/** The application's `sendEmail` (D-117), with its logger (D-368). */
export type SendEmail = (
	email: Email,
	facts: { readonly logger: Logger },
) => Promise<void>

const M = { as: master }

/**
 * Sends `email` with `userId`'s row, read as Master when it goes (D-357);
 * nothing to a user deleted since.
 */
export async function deliver(
	state: State,
	sendEmail: SendEmail,
	userId: string,
	email: Unsent,
): Promise<void> {
	// A transport's queries are untyped; this is the user model's row.
	const row: unknown = await state.users.queries.findUnique(
		{ where: { id: userId } },
		M,
	)
	if (row === null) return
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the user model is the one the application registers (D-62, D-80).
	const user = row as UserOf<Register>
	await sendEmail({ ...email, user }, { logger: appLogger() })
}

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
	(stateOf: () => State, sendEmail: SendEmail): Mailer =>
	async (kind, userId, to) => {
		const refused = await emailLimited(userId)
		if (refused !== undefined) return refused
		const token = await issueToken(userId, kind, to)
		await deliver(stateOf(), sendEmail, userId, { kind, to, token })
		return undefined
	}

/** Marks `userId`'s email verified: the user received an email (D-117). */
async function verify(state: State, userId: string): Promise<void> {
	const where = { id: userId }
	await state.users.queries.update({ where, data: { emailVerified: true } }, M)
}

/** A token's user, while the account keeps the email it went to (D-212). */
async function redeemCurrent(
	state: State,
	token: string,
	kind: 'reset' | 'verify',
	accept?: (userId: string) => Promise<void>,
): Promise<string> {
	const { userId, email } = await redeemToken(token, kind, accept)
	const current = await state.auth.subjectOf(userId, method)
	if (email !== current) throw invalidLink()
	return userId
}

/** Sends a reset link to `email`'s account; nothing to an email without one. */
export async function requestReset(
	state: State,
	mail: Mailer,
	email: string,
): Promise<PublicError | undefined> {
	const account = await state.auth.accountOf(method, email)
	if (account === undefined) return undefined
	return mail('reset', account.userId, email)
}

/** Sets the password a reset token's user chose, and verifies the email. */
export async function reset(
	state: State,
	token: string,
	password: string,
	path?: readonly string[],
): Promise<void> {
	// Checked and hashed first: any refusal keeps the link (D-209, D-353).
	let hash = ''
	const userId = await redeemCurrent(state, token, 'reset', async (id) => {
		await checkNewFor(state, id, password, path)
		hash = await hashPassword(password)
	})
	await setPassword(state, userId, hash)
	await verify(state, userId)
}

/** Verifies the email a verification token went to. */
export async function verifyWith(state: State, token: string): Promise<void> {
	const userId = await redeemCurrent(state, token, 'verify')
	await verify(state, userId)
}

/**
 * Sends `userId` a verification link, unless its email is verified or it
 * signs in another way, with no email to verify.
 */
export async function sendVerification(
	state: State,
	mail: Mailer,
	userId: string,
	emailVerified: boolean,
): Promise<void> {
	if (emailVerified) return
	const to = await state.auth.subjectOf(userId, method)
	if (to === undefined) return
	const refused = await mail('verify', userId, to)
	if (refused !== undefined) throw refused
}

/** Sends `newEmail` the link that moves `userId` to it (D-162). */
export async function requestChange(
	state: State,
	mail: Mailer,
	userId: string,
	newEmail: string,
): Promise<void> {
	const { auth, users } = state
	if ((await auth.accountOf(method, newEmail)) !== undefined) {
		// The details of a taken email at sign-up, the user's `email`.
		const details = { model: users.schema.name, fields: ['email'] }
		throw new PublicError('UNIQUE_VIOLATION', 'This email has an account.', {
			details,
		})
	}
	const refused = await mail('emailChange', userId, newEmail)
	if (refused !== undefined) throw refused
}

/** Writes the email an email-change token went to, verified (D-162). */
export async function confirmChange(
	state: State,
	token: string,
): Promise<void> {
	// A taken email undoes the redeem too: the link works until it expires.
	await transaction(async () => {
		const { userId, email } = await redeemToken(token, 'emailChange')
		const data = { email, emailVerified: true }
		await state.users.queries.update({ where: { id: userId }, data }, M)
	})
}
