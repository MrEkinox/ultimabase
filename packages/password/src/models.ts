// password's own models (D-110, D-113, D-114, D-117): each user's hash, and
// what the sign-in limit and the hourly limits count.
import ipaddr from 'ipaddr.js'
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
		fields: (f) => ({
			subject: f.string(),
			address: f.string(),
			at: f.dateTime(),
		}),
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
		fields: (f) => ({
			kind: f.string(),
			subject: f.string(),
			at: f.dateTime(),
		}),
		indexes: [{ fields: ['kind', 'subject'] }, { fields: ['at'] }],
	})

/**
 * What the limits count for `address`: an IPv6 address's /64 network, the
 * IPv4 address an IPv4-mapped one holds, in any notation, any other as it is
 * (D-114).
 */
export function networkOf(address: string): string {
	if (!ipaddr.IPv6.isValid(address)) return address
	const ip = ipaddr.IPv6.parse(address)
	if (ip.isIPv4MappedAddress()) return ip.toIPv4Address().toString()
	const prefix = ip.parts.slice(0, 4).map((group) => group.toString(16))
	return `${prefix.join(':')}::/64`
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

/**
 * Where an attempt comes from: a client's address, none for server code
 * that is still counted (D-161), `undefined` for server code that is not.
 */
export type Attempt =
	{ readonly subject: string; readonly address?: string } | undefined

/** What an attempt without an address is stored with; no address is it. */
const server = 'server'

/** The `n`th most recent failure but `id` matching `where`, if there is one. */
async function nth(
	where: { readonly subject?: string; readonly address?: string },
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
 * The failures but `id` that refuse the attempt: from one address, the 10th
 * on the subject or the 100th on it or from the address; without one, the
 * 10th on the subject from anywhere, and no address is filled (D-161).
 */
async function reached(
	subject: string,
	address: string | undefined,
	id: string,
): Promise<readonly (Date | undefined)[]> {
	if (address === undefined) return [await nth({ subject }, id, limit)]
	return [
		await nth({ subject, address }, id, limit),
		await nth({ subject }, id, ceiling),
		await nth({ address }, id, ceiling),
	]
}

/**
 * Counts an attempt as failed until `run` succeeds, so concurrent attempts
 * cannot pass the limit (D-113, D-114). Within 15 minutes, the 11th from one
 * address on a subject is refused, as the 101st on it or from the address,
 * and the 11th without an address on a subject (D-161); a success clears
 * its address's count, a busy refusal is not counted.
 */
export async function limited<T>(
	attempt: Attempt,
	run: () => Promise<T>,
): Promise<T> {
	if (attempt === undefined) return run()
	const { subject } = attempt
	const network =
		attempt.address === undefined ? undefined : networkOf(attempt.address)
	const address = network ?? server
	const now = Date.now()
	const since = new Date(now - window)
	await PasswordAttempt.deleteMany({ where: { at: { lte: since } } }, M)
	const { id } = await PasswordAttempt.create(
		{ data: { subject, address, at: new Date(now) } },
		M,
	)
	// Several may be reached: the latest says when to retry.
	const [oldest] = (await reached(subject, network, id))
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
 * the refusal instead, and the request is not counted. It is counted before
 * the others are, so concurrent requests cannot pass the limit (D-114).
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
	const { id } = await PasswordRequest.create(
		{ data: { kind, subject, at: new Date(now) } },
		M,
	)
	const where = { kind, subject, id: { not: id } }
	const recent = await PasswordRequest.findMany(
		{ where, orderBy: { at: 'desc' }, take: most },
		M,
	)
	const oldest = recent[most - 1]
	if (oldest === undefined) return undefined
	await PasswordRequest.deleteMany({ where: { id } }, M)
	return tooMany(oldest.at, hour, now)
}

/** Refuses the eleventh request of `kind` from `address` within one hour (D-114, D-117). */
export async function requestLimited(
	kind: RequestKind,
	address: string,
): Promise<void> {
	const refused = await hourly(kind, networkOf(address), requests)
	if (refused !== undefined) throw refused
}
