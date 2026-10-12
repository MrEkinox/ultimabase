import { createHash } from 'node:crypto'

import { FrameworkError, privateStore } from '@ultimabase/core'

import type { AttemptCollection } from './collections.js'
import { rejectTooManyAttempts } from './errors.js'

/**
 * Limits on failed attempts (ADR-0326). A limit allows `free` failures, then
 * each further failure locks the key for `baseDelayMs` doubled per failure,
 * at most `maxDelayMs`. Success resets the counters.
 */
interface AttemptLimit {
	readonly baseDelayMs: number
	readonly free: number
	readonly maxDelayMs: number
}

const minute = 60_000

// Per account and client address: an attacker from one address is slowed
// down well before the account-wide limit can delay the real user.
const pairLimit: AttemptLimit = {
	baseDelayMs: 1000,
	free: 5,
	maxDelayMs: 15 * minute,
}
// Per account, shared by every address and server: slows distributed guessing.
const accountLimit: AttemptLimit = {
	baseDelayMs: 1000,
	free: 20,
	maxDelayMs: 15 * minute,
}

/** One attempt subject: the account identifier and the client address. */
export interface AttemptSubject {
	/** The client address; `undefined` outside HTTP (only the account limit applies). */
	readonly address: string | undefined
	/** The method and the identifier the attempt targets, such as an email. */
	readonly identifier: string
	readonly method: string
}

const digest = (...parts: readonly string[]): string =>
	createHash('sha256').update(JSON.stringify(parts)).digest('hex')

const keysOf = (
	subject: AttemptSubject,
): readonly (readonly [string, AttemptLimit])[] => [
	[digest('account', subject.method, subject.identifier), accountLimit],
	...(subject.address === undefined
		? []
		: [
				[
					digest('pair', subject.method, subject.identifier, subject.address),
					pairLimit,
				] as const,
			]),
]

/** Rejects with `AUTH_TOO_MANY_ATTEMPTS` while a limit locks the subject. */
export const assertAttemptAllowed = async (
	attempts: AttemptCollection,
	subject: AttemptSubject,
	now: number = Date.now(),
): Promise<void> => {
	const store = privateStore(attempts)
	let lockedUntil = 0
	for (const [key] of keysOf(subject)) {
		const record = await store.findUnique({ where: { key } })
		if (record?.lockedUntil != null) {
			lockedUntil = Math.max(lockedUntil, Date.parse(record.lockedUntil))
		}
	}
	if (lockedUntil > now) {
		rejectTooManyAttempts(Math.ceil((lockedUntil - now) / 1000))
	}
}

const lockFor = (limit: AttemptLimit, failures: number): number =>
	failures <= limit.free
		? 0
		: Math.min(
				limit.baseDelayMs * 2 ** Math.min(failures - limit.free - 1, 30),
				limit.maxDelayMs,
			)

const isUniqueViolation = (error: unknown): boolean =>
	error instanceof FrameworkError && error.code === 'UNIQUE_VIOLATION'

/** Counts one failure for each key of the subject. */
export const recordAttemptFailure = async (
	attempts: AttemptCollection,
	subject: AttemptSubject,
	now: number = Date.now(),
): Promise<void> => {
	const store = privateStore(attempts)
	const updatedAt = new Date(now).toISOString()
	for (const [key, limit] of keysOf(subject)) {
		// A concurrent failure may win the swap; three tries keep counting fair.
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const record = await store.findUnique({ where: { key } })
			const failures = (record?.failures ?? 0) + 1
			const delay = lockFor(limit, failures)
			const data = {
				failures,
				lockedUntil: delay === 0 ? null : new Date(now + delay).toISOString(),
				updatedAt,
			}
			if (record === null) {
				try {
					await store.insert({ data: { ...data, key } })
					break
				} catch (error: unknown) {
					if (!isUniqueViolation(error)) throw error
					continue
				}
			}
			if (
				(await store.compareAndSwap({
					data,
					expected: { failures: record.failures },
					where: { key },
				})) !== null
			) {
				break
			}
		}
	}
}

/** Resets the counters of the subject after a success. */
export const resetAttempts = async (
	attempts: AttemptCollection,
	subject: AttemptSubject,
): Promise<void> => {
	const store = privateStore(attempts)
	for (const [key] of keysOf(subject)) {
		await store.delete({ where: { key } })
	}
}
