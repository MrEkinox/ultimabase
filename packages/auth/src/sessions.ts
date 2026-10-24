// Sessions (D-112): an opaque token, of which the database keeps only the
// SHA-256 digest, ending 30 days after its last use.
import { createHash, randomBytes } from 'node:crypto'
import type { Field, ModelOf, ScalarOptions } from 'ultimabase'
import { defineModel, master, PublicError } from 'ultimabase'

const M = { as: master }
const day = 24 * 60 * 60 * 1000
const lifetime = 30 * day
/** A session used with less left gets its lifetime again. */
const renewal = 15 * day

type SessionFields = {
	readonly tokenHash: Field<string, { readonly unique: true }>
	readonly userId: Field<string, ScalarOptions<string>>
	readonly expiresAt: Field<Date, ScalarOptions<Date>>
}

/** auth's own model (D-110). */
export const AuthSession: ModelOf<'AuthSession', SessionFields, []> =
	defineModel({
		name: 'AuthSession',
		fields: (f) => ({
			tokenHash: f.string({ unique: true }),
			userId: f.string(),
			expiresAt: f.date(),
		}),
		indexes: [{ fields: ['userId'] }],
	})

const digest = (token: string): string =>
	createHash('sha256').update(token).digest('base64url')

/** A token shown once, and the session it opens. */
export interface Opened {
	readonly token: string
	readonly expiresAt: Date
}

/** Opens a session for `userId`, ending the user's expired ones. */
export async function openSession(userId: string): Promise<Opened> {
	const now = Date.now()
	await AuthSession.deleteMany(
		{ where: { userId, expiresAt: { lte: new Date(now) } } },
		M,
	)
	const token = randomBytes(32).toString('base64url')
	const expiresAt = new Date(now + lifetime)
	await AuthSession.create(
		{ data: { tokenHash: digest(token), userId, expiresAt } },
		M,
	)
	return { token, expiresAt }
}

/**
 * The user id of the session `token` opened, renewed when it has less than
 * 15 days left; `undefined` for an unknown one, or an expired one, deleted.
 */
export async function sessionUser(token: string): Promise<string | undefined> {
	const tokenHash = digest(token)
	const session = await AuthSession.findUnique({ where: { tokenHash } }, M)
	if (session === null) return undefined
	const now = Date.now()
	const left = session.expiresAt.getTime() - now
	if (left <= 0) {
		await AuthSession.deleteMany({ where: { tokenHash } }, M)
		return undefined
	}
	if (left < renewal) {
		try {
			await AuthSession.update(
				{ where: { tokenHash }, data: { expiresAt: new Date(now + lifetime) } },
				M,
			)
		} catch (error) {
			// Signed out between the read and the renewal: the session ended.
			if (error instanceof PublicError && error.code === 'NOT_FOUND') {
				return undefined
			}
			throw error
		}
	}
	return session.userId
}

/** Ends the session `token` opened, if any. */
export async function closeSession(token: string): Promise<void> {
	await AuthSession.deleteMany({ where: { tokenHash: digest(token) } }, M)
}

/** Ends every session of a user. */
export async function revokeSessions(userId: string): Promise<void> {
	await AuthSession.deleteMany({ where: { userId } }, M)
}
