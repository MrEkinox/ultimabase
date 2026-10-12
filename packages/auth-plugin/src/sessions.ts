import { randomUUID } from 'node:crypto'

import { FrameworkError, privateStore } from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { AuthCollections, SessionRecord } from './collections.js'
import type { ResolvedAuthSessionPolicy } from './session-policy.js'
import {
	createAuthSession,
	createSessionToken,
	digestSessionToken,
	isSessionToken,
	readSessionGeneration,
	type AuthClient,
	type AuthSession,
	type IssuedAuthSession,
} from './session.js'

/** A session as `listSessions` reports it; never its token. */
export interface AuthSessionInfo {
	readonly address: string | null
	readonly createdAt: string
	/** Whether this is the session of the request that lists them. */
	readonly current: boolean
	/** The `User-Agent` of the client that created the session. */
	readonly device: string | null
	readonly expiresAt: string
	readonly id: string
	readonly lastUsedAt: string
	readonly method: string
}

/** Pairs the request-context session with the token issued exactly once. */
export interface IssuedSessionPair {
	readonly context: AuthSession
	readonly issued: IssuedAuthSession
}

const sessionListLimit = 1000
// `lastUsedAt` is written at most once per interval per session.
const lastUsedIntervalMs = 60_000

const isActive = (record: SessionRecord, now: number): boolean =>
	record.revokedAt === null &&
	Date.parse(record.expiresAt) > now &&
	Date.parse(record.absoluteExpiresAt) > now

const toContextSession = (record: SessionRecord): AuthSession =>
	createAuthSession(
		{
			absoluteExpiresAt: record.absoluteExpiresAt,
			authenticatedAt: record.authenticatedAt,
			createdAt: record.createdAt,
			expiresAt: record.expiresAt,
			id: record.id,
			method: record.method,
			rotationVersion: record.rotationVersion,
		},
		record.sessionGeneration,
	)

const isUniqueViolation = (error: unknown): boolean =>
	error instanceof FrameworkError && error.code === 'UNIQUE_VIOLATION'

/** Reads the current account generation; a user without a state row is at 0. */
export const readUserGeneration = async (
	collections: AuthCollections,
	userId: string,
): Promise<number> =>
	(await privateStore(collections.states).findUnique({ where: { userId } }))
		?.sessionGeneration ?? 0

/** Creates the state row of a user when missing and returns its generation. */
const ensureUserState = async (
	collections: AuthCollections,
	userId: string,
): Promise<number> => {
	const store = privateStore(collections.states)
	const existing = await store.findUnique({ where: { userId } })
	if (existing !== null) return existing.sessionGeneration
	try {
		await store.insert({ data: { sessionGeneration: 0, userId } })
	} catch (error: unknown) {
		if (!isUniqueViolation(error)) throw error
	}
	return readUserGeneration(collections, userId)
}

/** Advances the account generation, revoking every session issued before. */
export const advanceUserGeneration = async (
	collections: AuthCollections,
	userId: string,
): Promise<number> => {
	const store = privateStore(collections.states)
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const current = await ensureUserState(collections, userId)
		const next = current + 1
		if (
			(await store.compareAndSwap({
				data: { sessionGeneration: next },
				expected: { sessionGeneration: current },
				where: { userId },
			})) !== null
		) {
			return next
		}
	}
	throw new FrameworkError(
		'TRANSACTION_CONFLICT',
		'Concurrent session revocations conflicted.',
		{ publicMessage: 'The request conflicted; retry it.', retryable: true },
	)
}

/** Deletes the expired, revoked or stale sessions of one user. */
const purgeInactiveSessions = async (
	collections: AuthCollections,
	userId: string,
	generation: number,
	now: number,
): Promise<void> => {
	const store = privateStore(collections.sessions)
	const records = await store.findMany({
		limit: sessionListLimit,
		where: { userId },
	})
	for (const record of records) {
		if (!isActive(record, now) || record.sessionGeneration !== generation) {
			await store.delete({ where: { id: record.id } })
		}
	}
}

/** Inserts one fresh opaque session and returns its one-time token. */
export const issueSession = async (
	collections: AuthCollections,
	options: Readonly<{
		readonly client: AuthClient | undefined
		readonly method: string
		readonly policy: ResolvedAuthSessionPolicy
		readonly userId: string
	}>,
	now: number = Date.now(),
): Promise<IssuedSessionPair> => {
	const { client, method, policy, userId } = options
	const generation = await ensureUserState(collections, userId)
	await purgeInactiveSessions(collections, userId, generation, now)
	const createdAt = new Date(now).toISOString()
	const absoluteExpiresAt = new Date(
		now + policy.absoluteExpiresInMs,
	).toISOString()
	const expiresAt = new Date(now + policy.expiresInMs).toISOString()
	const token = createSessionToken()
	const record = await privateStore(collections.sessions).insert({
		data: {
			absoluteExpiresAt,
			address: client?.address ?? null,
			authenticatedAt: createdAt,
			createdAt,
			expiresAt,
			id: randomUUID(),
			lastUsedAt: createdAt,
			method,
			revokedAt: null,
			rotationVersion: 0,
			sessionGeneration: generation,
			tokenDigest: token.digest,
			userAgent: client?.userAgent ?? null,
			userId,
		},
	})
	return immutableRecord({
		context: toContextSession(record),
		issued: immutableRecord({
			absoluteExpiresAt,
			expiresAt,
			id: record.id,
			token: token.token,
		}),
	})
}

/** Resolves one valid raw token, refreshing `lastUsedAt` at most once a minute. */
export const validateSessionToken = async (
	collections: AuthCollections,
	token: unknown,
	now: number = Date.now(),
): Promise<
	| Readonly<{ readonly context: AuthSession; readonly userId: string }>
	| undefined
> => {
	if (!isSessionToken(token)) return undefined
	const store = privateStore(collections.sessions)
	const record = await store.findUnique({
		where: { tokenDigest: digestSessionToken(token) },
	})
	if (record === null || !isActive(record, now)) return undefined
	if (
		(await readUserGeneration(collections, record.userId)) !==
		record.sessionGeneration
	) {
		return undefined
	}
	if (now - Date.parse(record.lastUsedAt) >= lastUsedIntervalMs) {
		// A concurrent request may have refreshed it already: losing is fine.
		await store.compareAndSwap({
			data: { lastUsedAt: new Date(now).toISOString() },
			expected: { lastUsedAt: record.lastUsedAt },
			where: { id: record.id },
		})
	}
	return immutableRecord({
		context: toContextSession(record),
		userId: record.userId,
	})
}

/** Reads the row of a context session while it is live and unchanged. */
const findUnchangedSession = async (
	collections: AuthCollections,
	session: AuthSession,
	now: number,
): Promise<SessionRecord | undefined> => {
	const record = await privateStore(collections.sessions).findUnique({
		where: { id: session.id },
	})
	return record !== null &&
		isActive(record, now) &&
		record.rotationVersion === session.rotationVersion &&
		record.sessionGeneration === readSessionGeneration(session) &&
		(await readUserGeneration(collections, record.userId)) ===
			record.sessionGeneration
		? record
		: undefined
}

/** Applies `data` only while the session row is still live and unchanged. */
const swapUnchangedSession = async (
	collections: AuthCollections,
	session: AuthSession,
	data: Readonly<
		| { revokedAt: string }
		| { sessionGeneration: number }
		| { authenticatedAt: string }
	>,
	now: number,
): Promise<SessionRecord | undefined> => {
	if ((await findUnchangedSession(collections, session, now)) === undefined) {
		return undefined
	}
	return (
		(await privateStore(collections.sessions).compareAndSwap({
			data,
			expected: {
				revokedAt: null,
				rotationVersion: session.rotationVersion,
				sessionGeneration: readSessionGeneration(session),
			},
			where: { id: session.id },
		})) ?? undefined
	)
}

/** Revokes only the unchanged current session. */
export const revokeCurrentSession = async (
	collections: AuthCollections,
	session: AuthSession,
	now: number = Date.now(),
): Promise<boolean> =>
	(await swapUnchangedSession(
		collections,
		session,
		{ revokedAt: new Date(now).toISOString() },
		now,
	)) !== undefined

/** Records a new proof of credentials on the current session. */
export const markSessionAuthenticated = async (
	collections: AuthCollections,
	session: AuthSession,
	now: number = Date.now(),
): Promise<boolean> =>
	(await swapUnchangedSession(
		collections,
		session,
		{ authenticatedAt: new Date(now).toISOString() },
		now,
	)) !== undefined

/**
 * Revokes every other session of the user: the generation advances and only
 * the current session moves along with it.
 */
export const revokeOtherSessions = async (
	collections: AuthCollections,
	session: AuthSession,
	userId: string,
	now: number = Date.now(),
): Promise<boolean> => {
	if ((await findUnchangedSession(collections, session, now)) === undefined) {
		return false
	}
	const generation = await advanceUserGeneration(collections, userId)
	return (
		(await privateStore(collections.sessions).compareAndSwap({
			data: { sessionGeneration: generation },
			expected: {
				revokedAt: null,
				rotationVersion: session.rotationVersion,
				sessionGeneration: readSessionGeneration(session),
			},
			where: { id: session.id },
		})) !== null
	)
}

/** Revokes one session of a user by id; another user's session is not found. */
export const revokeSessionById = async (
	collections: AuthCollections,
	userId: string,
	id: string,
	now: number = Date.now(),
): Promise<boolean> => {
	const store = privateStore(collections.sessions)
	const record = await store.findUnique({ where: { id } })
	if (record?.userId !== userId || !isActive(record, now)) return false
	return (
		(await store.compareAndSwap({
			data: { revokedAt: new Date(now).toISOString() },
			expected: { revokedAt: null },
			where: { id },
		})) !== null
	)
}

/** Lists the live sessions of one user, most recently used first. */
export const listUserSessions = async (
	collections: AuthCollections,
	userId: string,
	currentId: string | undefined,
	now: number = Date.now(),
): Promise<readonly AuthSessionInfo[]> => {
	const generation = await readUserGeneration(collections, userId)
	const records = await privateStore(collections.sessions).findMany({
		limit: sessionListLimit,
		where: { userId },
	})
	return immutableArray(
		records
			.filter(
				(record) =>
					isActive(record, now) && record.sessionGeneration === generation,
			)
			.sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
			.map((record) =>
				immutableRecord({
					address: record.address,
					createdAt: record.createdAt,
					current: record.id === currentId,
					device: record.userAgent,
					expiresAt: record.expiresAt,
					id: record.id,
					lastUsedAt: record.lastUsedAt,
					method: record.method,
				}),
			),
	)
}

/** Rotates one unchanged live session through compare-and-swap. */
export const rotateSession = async (
	collections: AuthCollections,
	session: AuthSession,
	policy: ResolvedAuthSessionPolicy,
	now: number = Date.now(),
): Promise<(IssuedSessionPair & Readonly<{ userId: string }>) | undefined> => {
	const record = await findUnchangedSession(collections, session, now)
	if (record === undefined) return undefined
	const token = createSessionToken()
	const updated = await privateStore(collections.sessions).compareAndSwap({
		data: {
			expiresAt: new Date(
				Math.min(
					now + policy.expiresInMs,
					Date.parse(record.absoluteExpiresAt),
				),
			).toISOString(),
			lastUsedAt: new Date(now).toISOString(),
			rotationVersion: record.rotationVersion + 1,
			tokenDigest: token.digest,
		},
		expected: {
			revokedAt: null,
			rotationVersion: record.rotationVersion,
			sessionGeneration: record.sessionGeneration,
			tokenDigest: record.tokenDigest,
		},
		where: { id: record.id },
	})
	if (updated === null) return undefined
	return immutableRecord({
		context: toContextSession(updated),
		issued: immutableRecord({
			absoluteExpiresAt: updated.absoluteExpiresAt,
			expiresAt: updated.expiresAt,
			id: updated.id,
			token: token.token,
		}),
		userId: updated.userId,
	})
}
