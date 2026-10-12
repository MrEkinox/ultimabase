import { privateStore } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import type { AuthCollections } from './collections.js'
import type { ResolvedAuthSessionPolicy } from './session-policy.js'
import { createSessionToken, type AuthSession } from './session.js'
import {
	findUnchangedSession,
	toContextSession,
	type IssuedSessionPair,
} from './sessions.js'

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
