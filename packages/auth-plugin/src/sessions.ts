import { randomUUID } from 'node:crypto'

import { privateStore } from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { AuthCollections, SessionRecord } from './collections.js'
import { readUserState, updateUserState } from './user-state.js'
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
	/** The client address that created the session (personal data), or `null` when unknown. */
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

// A user keeps at most this many live sessions; the oldest is dropped.
const sessionListLimit = 100
// `lastUsedAt` is written at most once per interval per session.
const lastUsedIntervalMs = 60_000

export const isActive = (record: SessionRecord, now: number): boolean =>
	record.revokedAt === null &&
	Date.parse(record.expiresAt) > now &&
	Date.parse(record.absoluteExpiresAt) > now

export const toContextSession = (record: SessionRecord): AuthSession =>
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

/** Reads the current account generation; a user without a state row is at 0. */
export const readUserGeneration = async (
	collections: AuthCollections,
	userId: string,
): Promise<number> =>
	(await readUserState(collections, userId)).sessionGeneration

/** Reads the live sessions the user's state lists, in list order. */
const readLiveSessions = async (
	collections: AuthCollections,
	ids: readonly string[],
	generation: number,
	now: number,
): Promise<readonly SessionRecord[]> => {
	const store = privateStore(collections.sessions)
	const live: SessionRecord[] = []
	for (const id of ids) {
		const record = await store.findUnique({ where: { id } })
		if (
			record !== null &&
			isActive(record, now) &&
			record.sessionGeneration === generation
		) {
			live.push(record)
		}
	}
	return live
}

/** Deletes the session rows that left the user's list. */
const deleteSessions = async (
	collections: AuthCollections,
	ids: readonly string[],
): Promise<void> => {
	const store = privateStore(collections.sessions)
	for (const id of ids) await store.delete({ where: { id } })
}

/** Advances the account generation, revoking every session issued before. */
export const advanceUserGeneration = async (
	collections: AuthCollections,
	userId: string,
	keep?: AuthSession,
): Promise<number> => {
	const previous = await readUserState(collections, userId)
	const next = await updateUserState(collections, userId, (state) => ({
		sessionGeneration: state.sessionGeneration + 1,
		sessionIds: keep === undefined ? [] : [keep.id],
	}))
	await deleteSessions(
		collections,
		previous.sessionIds.filter((id) => id !== keep?.id),
	)
	return next.sessionGeneration
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
	const state = await readUserState(collections, userId)
	const generation = state.sessionGeneration
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
	// The list keeps the live sessions only, newest last, within the limit.
	const live = await readLiveSessions(
		collections,
		state.sessionIds,
		generation,
		now,
	)
	const kept = live.slice(-(sessionListLimit - 1)).map(({ id }) => id)
	await updateUserState(collections, userId, () => ({
		sessionIds: [...kept, record.id],
	}))
	await deleteSessions(
		collections,
		state.sessionIds.filter((id) => !kept.includes(id)),
	)
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
export const findUnchangedSession = async (
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
	const generation = await advanceUserGeneration(collections, userId, session)
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
	const state = await readUserState(collections, userId)
	const records = await readLiveSessions(
		collections,
		state.sessionIds,
		state.sessionGeneration,
		now,
	)
	return immutableArray(
		[...records]
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
