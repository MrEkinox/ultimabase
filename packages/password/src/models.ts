// password's own models (D-110, D-113, D-114, D-117): each user's hash, and
// what the sign-in limit and the hourly limits count.
import { isIPv6 } from 'node:net'
import type { Field, ModelOf, ScalarOptions } from 'ultimabase'
import { defineModel, master, PublicError } from 'ultimabase'

const M = { as: master }
const limit = 10
const ceiling = 100
const window = 15 * 60 * 1000
const requests = 10
export const hour: number = 60 * 60 * 1000

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

type RequestFields = {
	readonly kind: Field<string, ScalarOptions<string>>
	/** An address's network, or a user for the emails it receives. */
	readonly subject: Field<string, ScalarOptions<string>>
	readonly at: Field<Date, ScalarOptions<Date>>
}

export const PasswordRequest: ModelOf<'PasswordRequest', RequestFields, []> =
	defineModel({
		name: 'PasswordRequest',
		fields: (f) => ({ kind: f.string(), subject: f.string(), at: f.date() }),
		indexes: [{ fields: ['kind', 'subject'] }, { fields: ['at'] }],
	})

const groups = (part: string): string[] => (part === '' ? [] : part.split(':'))

/**
 * What the limits count for `address`: an IPv6 address's /64 network, the
 * IPv4 address an IPv4-mapped one holds, any other as it is (D-114).
 */
export function networkOf(address: string): string {
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
	if (mapped?.[1] !== undefined) return mapped[1]
	const bare = address.split('%')[0] ?? ''
	if (!isIPv6(bare)) return address
	const [head = '', tail = ''] = bare.split('::')
	const left = groups(head)
	const right = groups(tail)
	const embedded = bare.includes('.') ? 1 : 0
	const missing = 8 - left.length - right.length - embedded
	const all = [
		...left,
		...Array<string>(Math.max(missing, 0)).fill('0'),
		...right,
	]
	const prefix = all.slice(0, 4).map((group) => Number.parseInt(group, 16))
	return `${prefix.map((group) => group.toString(16)).join(':')}::/64`
}

const tooMany = (oldest: Date, span: number, now: number): PublicError =>
	new PublicError('TOO_MANY_ATTEMPTS', 'Too many attempts: try again later.', {
		details: {
			retryAfter: Math.max(
				Math.ceil((oldest.getTime() + span - now) / 1000),
				1,
			),
		},
	})

/** Where an attempt comes from; `undefined` for server code, not counted. */
export type Attempt =
	{ readonly subject: string; readonly address: string } | undefined

/** The `n`th most recent failure but `id` matching `where`, if there is one. */
async function nth(
	where: { readonly subject: string; readonly address?: string },
	id: string,
	n: number,
): Promise<Date | undefined> {
	const failures = await PasswordAttempt.findMany(
		{ where: { ...where, id: { not: id } }, orderBy: { at: 'desc' }, take: n },
		M,
	)
	return failures[n - 1]?.at
}

/**
 * Counts an attempt as failed until `run` succeeds, so concurrent attempts
 * cannot pass the limit; the eleventh from one address within 15 minutes is
 * refused, as the 101st from any (D-114), and a success clears its address's
 * count (D-113). An attempt refused as busy is not counted (D-114).
 */
export async function limited<T>(
	attempt: Attempt,
	run: () => Promise<T>,
): Promise<T> {
	if (attempt === undefined) return run()
	const { subject } = attempt
	const address = networkOf(attempt.address)
	const now = Date.now()
	const since = new Date(now - window)
	await PasswordAttempt.deleteMany({ where: { at: { lte: since } } }, M)
	const { id } = await PasswordAttempt.create(
		{ data: { subject, address, at: new Date(now) } },
		M,
	)
	// Both may be reached: the later one says when to retry.
	const [oldest] = [
		await nth({ subject, address }, id, limit),
		await nth({ subject }, id, ceiling),
	]
		.filter((at) => at !== undefined)
		.toSorted((a, b) => b.getTime() - a.getTime())
	if (oldest !== undefined) {
		await PasswordAttempt.deleteMany({ where: { id } }, M)
		throw tooMany(oldest, window, now)
	}
	try {
		const result = await run()
		await PasswordAttempt.deleteMany({ where: { subject, address } }, M)
		return result
	} catch (error) {
		if (error instanceof PublicError && error.code === 'TOO_MANY_ATTEMPTS') {
			await PasswordAttempt.deleteMany({ where: { id } }, M)
		}
		throw error
	}
}

/** What the hourly limits count (D-114, D-117). */
export type RequestKind = 'signUp' | 'reset' | 'verify' | 'email'

/**
 * Counts a request of `kind` from `subject`; past `most` within one hour,
 * the refusal instead, and the request is not counted.
 */
export async function hourly(
	kind: RequestKind,
	subject: string,
	most: number,
): Promise<PublicError | undefined> {
	const now = Date.now()
	await PasswordRequest.deleteMany(
		{ where: { at: { lte: new Date(now - hour) } } },
		M,
	)
	const recent = await PasswordRequest.findMany(
		{ where: { kind, subject }, orderBy: { at: 'desc' }, take: most },
		M,
	)
	const oldest = recent[most - 1]
	if (oldest !== undefined) return tooMany(oldest.at, hour, now)
	await PasswordRequest.create(
		{ data: { kind, subject, at: new Date(now) } },
		M,
	)
	return undefined
}

/** Refuses the eleventh request of `kind` from `address` within one hour (D-114, D-117). */
export async function requestLimited(
	kind: RequestKind,
	address: string,
): Promise<void> {
	const refused = await hourly(kind, networkOf(address), requests)
	if (refused !== undefined) throw refused
}
