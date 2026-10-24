// password's emails (D-117): the tokens their links carry, used once, and
// the emails each account receives within one hour.
import { createHash, randomBytes } from 'node:crypto'
import type { Field, ModelOf, ScalarOptions } from 'ultimabase'
import { defineModel, master, PublicError } from 'ultimabase'
import { hour, hourly } from './models.ts'

const M = { as: master }
/** The emails an account receives within one hour, of either kind. */
const emails = 3

/** What an email's token lets its holder do. */
export type EmailKind = 'reset' | 'verify'

/** What `sendEmail` receives: the application writes the text and the link. */
export interface Email {
	readonly kind: EmailKind
	/** The account's email, normalized. */
	readonly to: string
	/** What the link carries, for `resetPassword` or `verifyEmail`. */
	readonly token: string
	readonly userId: string
}

const lifetimes: Readonly<Record<EmailKind, number>> = {
	reset: hour,
	verify: 24 * hour,
}

type TokenFields = {
	readonly userId: Field<string, ScalarOptions<string>>
	readonly kind: Field<string, ScalarOptions<string>>
	/** The token's SHA-256: a leaked database gives no working link. */
	readonly hash: Field<string, { readonly unique: true }>
	readonly expiresAt: Field<Date, ScalarOptions<Date>>
}

export const PasswordToken: ModelOf<'PasswordToken', TokenFields, []> =
	defineModel({
		name: 'PasswordToken',
		fields: (f) => ({
			userId: f.string(),
			kind: f.string(),
			hash: f.string({ unique: true }),
			expiresAt: f.date(),
		}),
		indexes: [{ fields: ['userId', 'kind'] }, { fields: ['expiresAt'] }],
	})

const hashOf = (token: string): string =>
	createHash('sha256').update(token).digest('base64url')

/** A new token of `kind` for `userId`, which replaces the older one. */
export async function issueToken(
	userId: string,
	kind: EmailKind,
): Promise<string> {
	const now = Date.now()
	await PasswordToken.deleteMany(
		{ where: { expiresAt: { lte: new Date(now) } } },
		M,
	)
	await PasswordToken.deleteMany({ where: { userId, kind } }, M)
	const token = randomBytes(32).toString('base64url')
	const expiresAt = new Date(now + lifetimes[kind])
	await PasswordToken.create(
		{ data: { userId, kind, hash: hashOf(token), expiresAt } },
		M,
	)
	return token
}

const invalidLink = () =>
	new PublicError('INVALID_CREDENTIALS', 'This link is invalid or has expired.')

/** The user a token of `kind` was issued to; a wrong, used or expired one fails. */
export async function redeemToken(
	token: string,
	kind: EmailKind,
): Promise<string> {
	const hash = hashOf(token)
	const stored = await PasswordToken.findUnique({ where: { hash } }, M)
	if (stored?.kind !== kind) throw invalidLink()
	// One delete wins, so a token used twice at once works once.
	const { count } = await PasswordToken.deleteMany({ where: { hash } }, M)
	if (count === 0 || stored.expiresAt.getTime() <= Date.now()) {
		throw invalidLink()
	}
	return stored.userId
}

/**
 * Counts an email to `userId`; past three within one hour, the refusal
 * instead, and the email is not counted.
 */
export const emailLimited = async (
	userId: string,
): Promise<PublicError | undefined> => hourly('email', userId, emails)
