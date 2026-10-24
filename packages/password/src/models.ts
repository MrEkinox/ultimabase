// password's own models (D-110, D-113): each user's hash, and the failed
// attempts the sign-in limit counts.
import type { Field, ModelOf, ScalarOptions } from 'ultimabase'
import { defineModel, master, PublicError } from 'ultimabase'

const M = { as: master }
const limit = 10
const window = 15 * 60 * 1000

type HashFields = {
	readonly userId: Field<string, { readonly unique: true }>
	readonly hash: Field<string, ScalarOptions<string>>
	/** New each time the password is set, kept when it is rehashed. */
	readonly stamp: Field<string, { readonly unique: true }>
}

export const PasswordHash: ModelOf<'PasswordHash', HashFields, []> =
	defineModel({
		name: 'PasswordHash',
		fields: (f) => ({
			userId: f.string({ unique: true }),
			hash: f.string(),
			stamp: f.string({ unique: true }),
		}),
	})

type AttemptFields = {
	readonly subject: Field<string, ScalarOptions<string>>
	readonly address: Field<string, ScalarOptions<string>>
	readonly at: Field<Date, ScalarOptions<Date>>
}

export const PasswordAttempt: ModelOf<'PasswordAttempt', AttemptFields, []> =
	defineModel({
		name: 'PasswordAttempt',
		fields: (f) => ({ subject: f.string(), address: f.string(), at: f.date() }),
		indexes: [{ fields: ['subject', 'address'] }, { fields: ['at'] }],
	})

/** Where an attempt comes from; `undefined` for server code, not counted. */
export type Attempt =
	{ readonly subject: string; readonly address: string } | undefined

/**
 * Counts an attempt as failed until `run` succeeds, so concurrent attempts
 * cannot pass the limit; the eleventh within 15 minutes is refused, and a
 * success clears the count (D-113).
 */
export async function limited<T>(
	attempt: Attempt,
	run: () => Promise<T>,
): Promise<T> {
	if (attempt === undefined) return run()
	const { subject, address } = attempt
	const now = Date.now()
	const since = new Date(now - window)
	await PasswordAttempt.deleteMany({ where: { at: { lte: since } } }, M)
	const { id } = await PasswordAttempt.create(
		{ data: { subject, address, at: new Date(now) } },
		M,
	)
	const failures = await PasswordAttempt.findMany(
		{
			where: { subject, address, id: { not: id } },
			orderBy: { at: 'desc' },
			take: limit,
		},
		M,
	)
	const oldest = failures[limit - 1]
	if (oldest !== undefined) {
		await PasswordAttempt.deleteMany({ where: { id } }, M)
		const retryAfter = Math.ceil((oldest.at.getTime() + window - now) / 1000)
		throw new PublicError(
			'TOO_MANY_ATTEMPTS',
			'Too many attempts: try again later.',
			{
				details: { retryAfter: Math.max(retryAfter, 1) },
			},
		)
	}
	const result = await run()
	await PasswordAttempt.deleteMany({ where: { subject, address } }, M)
	return result
}
