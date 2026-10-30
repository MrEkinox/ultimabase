// The user's `email` (D-162): the password account's subject, which
// password's hooks keep in step with the field, whichever path writes it.
import type { Caller } from 'ultimabase'
import { isMaster, master, PublicError } from 'ultimabase'
import type { State } from './core.ts'
import { method } from './core.ts'
import { later } from './email-functions.ts'
import { emailOf, valid } from './input.ts'
import { PasswordToken } from './tokens.ts'

const M = { as: master }

type Emailed = { readonly id: string; readonly email: string | null }
type Draft = {
	email?: string | null | undefined
	emailVerified?: boolean | undefined
}

/** Only the user itself and Master read the email. */
export const readsEmail = (facts: {
	readonly caller: Caller
	readonly record: { readonly id: string }
}): boolean => {
	const { caller, record } = facts
	return (
		isMaster(caller) || (caller.kind === 'user' && caller.user.id === record.id)
	)
}

/** Normalizes a created user's email, as at sign-up. */
export function creating(data: Draft): void {
	if (typeof data.email === 'string') {
		data.email = valid(emailOf, data.email, 'email')
	}
}

/** Links the created user's email as its password account. */
export async function created(state: State, record: Emailed): Promise<void> {
	if (record.email === null) return
	await state.auth.linkAccount(record.id, method, record.email)
}

/**
 * Normalizes an updated email, refuses `null` while the account is linked,
 * and unverifies another email unless the write verifies it.
 */
export async function updating(
	state: State,
	record: Emailed,
	data: Draft,
): Promise<void> {
	if (data.email === undefined) return
	const subject = await state.auth.subjectOf(record.id, method)
	if (data.email === null) {
		if (subject === undefined) return
		const message = 'closeAccount removes the email.'
		throw new PublicError('VALIDATION_FAILED', `email: ${message}`, {
			details: { issues: [{ path: ['email'], message }] },
		})
	}
	data.email = valid(emailOf, data.email, 'email')
	if (data.email !== subject) data.emailVerified ??= false
}

/**
 * Moves the password account to the new email, in the write's transaction,
 * and deletes the links the old one received.
 */
export async function updated(
	state: State,
	record: Emailed,
	previous: Emailed,
): Promise<void> {
	if (record.email === null || record.email === previous.email) return
	const { auth } = state
	const subject = await auth.subjectOf(record.id, method)
	// Filling the field from the account changes nothing else.
	if (subject === record.email) return
	if (subject !== undefined) await auth.unlinkAccount(record.id, method)
	await auth.linkAccount(record.id, method, record.email)
	const where = { userId: record.id, kind: { in: ['reset', 'verify'] } }
	await PasswordToken.deleteMany({ where }, M)
}

/** Tells the old address, once the change commits, when `sendEmail` exists. */
export function committed(
	state: State,
	record: Emailed,
	previous: Emailed,
): void {
	const { sendEmail } = state
	const [from, to] = [previous.email, record.email]
	if (sendEmail === undefined || from === null || to === null || from === to) {
		return
	}
	later(state, async () => {
		await sendEmail({
			kind: 'emailChanged',
			to: from,
			newEmail: to,
			userId: record.id,
		})
	})
}
