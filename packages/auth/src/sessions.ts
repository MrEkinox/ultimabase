// Sessions (D-112): an opaque token, of which the database keeps only the
// SHA-256 digest, ending a lifetime after its last use and at the longest
// after its sign-in (D-115), both the application's (D-165).
import { createHash, randomBytes } from 'node:crypto'
import type { Field, ModelOf, ScalarOptions } from 'ultimabase'
import { defineModel, master, PublicError, Refused } from 'ultimabase'

const M = { as: master }
const day = 24 * 60 * 60 * 1000

/** How long sessions last, in milliseconds (D-165). */
export interface Durations {
	/** After the last use; a session used with less than half left is renewed. */
	readonly lifetime: number
	/** After the sign-in, which no renewal goes past (D-115). */
	readonly longest: number
}

const positive = (value: number): boolean => Number.isFinite(value) && value > 0

/** `authPlugin`'s `sessions`, checked, with 30 and 365 days by default. */
export function durationsOf(sessions: Partial<Durations> = {}): Durations {
	const { lifetime = 30 * day, longest = 365 * day } = sessions
	if (!positive(lifetime) || !positive(longest)) {
		throw new Refused(
			'authPlugin() sessions: lifetime and longest are positive numbers of milliseconds.',
		)
	}
	if (lifetime > longest) {
		throw new Refused('authPlugin() sessions: lifetime is longer than longest.')
	}
	return { lifetime, longest }
}

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
			expiresAt: f.dateTime(),
		}),
		indexes: [{ fields: ['userId'] }, { fields: ['expiresAt'] }],
	})

const digest = (token: string): string =>
	createHash('sha256').update(token).digest('base64url')

/** A token shown once, and the session it opens. */
export interface Opened {
	readonly token: string
	readonly expiresAt: Date
}

/** Opens a session for `userId`, ending every expired one (D-115). */
export async function openSession(
	userId: string,
	{ lifetime }: Durations,
): Promise<Opened> {
	const now = Date.now()
	await AuthSession.deleteMany(
		{ where: { expiresAt: { lte: new Date(now) } } },
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
 * The session `token` opened, renewed when it has less than half its lifetime
 * left, up to the longest after its sign-in; `undefined` for an unknown one,
 * or an expired one, deleted.
 */
export async function sessionOf(
	token: string,
	{ lifetime, longest }: Durations,
): Promise<{ readonly userId: string; readonly expiresAt: Date } | undefined> {
	const tokenHash = digest(token)
	const session = await AuthSession.findUnique({ where: { tokenHash } }, M)
	if (session === null) return undefined
	const now = Date.now()
	const left = session.expiresAt.getTime() - now
	if (left <= 0) {
		await AuthSession.deleteMany({ where: { tokenHash } }, M)
		return undefined
	}
	const end = Math.min(now + lifetime, session.createdAt.getTime() + longest)
	if (left < lifetime / 2 && end > session.expiresAt.getTime()) {
		try {
			await AuthSession.update(
				{ where: { tokenHash }, data: { expiresAt: new Date(end) } },
				M,
			)
		} catch (error) {
			// Signed out between the read and the renewal: the session ended.
			if (error instanceof PublicError && error.code === 'NOT_FOUND') {
				return undefined
			}
			throw error
		}
		return { userId: session.userId, expiresAt: new Date(end) }
	}
	return session
}

/** Ends the session `token` opened, if any. */
export async function closeSession(token: string): Promise<void> {
	await AuthSession.deleteMany({ where: { tokenHash: digest(token) } }, M)
}

/** Ends every session of a user. */
export async function revokeSessions(userId: string): Promise<void> {
	await AuthSession.deleteMany({ where: { userId } }, M)
}
