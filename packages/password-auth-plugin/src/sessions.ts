import { randomUUID } from 'node:crypto'

import {
	dateTimeField,
	definePrivateCollection,
	intField,
	privateStore,
	stringField,
	uuidField,
	type DateTimeField,
	type IntField,
	type PrivateCollection,
	type PrivateCollectionRecord,
	type ScalarFieldTypegenState,
	type SchemaDefinition,
	type StringField,
	type UuidField,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import {
	findPasswordCredentialByUserId,
	type PasswordCredentialCollection,
} from './credentials.js'
import type { ResolvedPasswordSessionPolicy } from './session-policy.js'
import {
	createPasswordSession,
	createPasswordSessionToken,
	digestPasswordSessionToken,
	isPasswordSessionToken,
	readPasswordSessionGeneration,
	type IssuedPasswordSession,
	type PasswordSession,
} from './session.js'

type FieldState<
	TRequired extends boolean,
	TImmutable extends boolean,
> = ScalarFieldTypegenState<TRequired, false, TImmutable, false>

type PasswordSessionFields = Readonly<{
	absoluteExpiresAt: DateTimeField<FieldState<true, true>>
	createdAt: DateTimeField<FieldState<true, true>>
	expiresAt: DateTimeField<FieldState<true, false>>
	id: UuidField<FieldState<true, true>>
	revokedAt: DateTimeField<FieldState<false, false>>
	rotationVersion: IntField<FieldState<true, false>>
	sessionGeneration: IntField<FieldState<true, false>>
	tokenDigest: StringField<FieldState<true, false>>
	userId: UuidField<FieldState<true, true>>
}>

/** Represents the exact package-private session collection token. */
export type PasswordSessionCollection = PrivateCollection<
	PasswordSessionFields,
	readonly [
		Readonly<{ readonly fields: readonly ['id'] }>,
		Readonly<{ readonly fields: readonly ['tokenDigest'] }>,
	]
>

type PasswordSessionRecord = PrivateCollectionRecord<PasswordSessionCollection>

/** Pairs the request-context session with the token issued exactly once. */
type IssuedSession = Readonly<{
	readonly context: PasswordSession
	readonly issued: IssuedPasswordSession
}>

/** Builds one private session descriptor for the configured User identity. */
export const createPasswordSessionCollection = (
	user: SchemaDefinition,
	policy: ResolvedPasswordSessionPolicy,
): PasswordSessionCollection =>
	definePrivateCollection({
		contributionId: 'sessions',
		fields: {
			absoluteExpiresAt: dateTimeField({ immutable: true, required: true }),
			createdAt: dateTimeField({ immutable: true, required: true }),
			expiresAt: dateTimeField({ required: true }),
			id: uuidField({ immutable: true, required: true }),
			revokedAt: dateTimeField(),
			rotationVersion: intField({ required: true }),
			sessionGeneration: intField({ required: true }),
			tokenDigest: stringField({ required: true }),
			userId: uuidField({ immutable: true, required: true }),
		},
		indexes: [{ fields: ['id'] }, { fields: ['tokenDigest'] }] as const,
		normalizedStaticOptions: {
			absoluteExpiresInMs: policy.absoluteExpiresInMs,
			expiresInMs: policy.expiresInMs,
		},
		protocolVersion: 2,
		references: [{ field: 'userId', onDelete: 'cascade', target: user }],
	})

const isActive = (record: PasswordSessionRecord, now: number): boolean =>
	record.revokedAt === null &&
	Date.parse(record.expiresAt) > now &&
	Date.parse(record.absoluteExpiresAt) > now

const toContextSession = (record: PasswordSessionRecord): PasswordSession =>
	createPasswordSession(
		{
			absoluteExpiresAt: record.absoluteExpiresAt,
			createdAt: record.createdAt,
			expiresAt: record.expiresAt,
			id: record.id,
			rotationVersion: record.rotationVersion,
		},
		record.sessionGeneration,
	)

/**
 * Reads the stored row of a context session only while it is still live and
 * has neither rotated nor moved to another account generation since then.
 */
const findUnchangedSession = async (
	collection: PasswordSessionCollection,
	session: PasswordSession,
	now: number,
): Promise<PasswordSessionRecord | undefined> => {
	const sessionGeneration = readPasswordSessionGeneration(session)
	const record = await privateStore(collection).findUnique({
		where: { id: session.id },
	})
	return record !== null &&
		isActive(record, now) &&
		record.rotationVersion === session.rotationVersion &&
		record.sessionGeneration === sessionGeneration
		? record
		: undefined
}

/** Applies `data` only while the session row is still unrevoked and unchanged. */
const swapUnchangedSession = async (
	collection: PasswordSessionCollection,
	session: PasswordSession,
	data: Readonly<{ revokedAt: string } | { sessionGeneration: number }>,
	now: number,
): Promise<boolean> =>
	(await findUnchangedSession(collection, session, now)) !== undefined &&
	(await privateStore(collection).compareAndSwap({
		data,
		expected: {
			revokedAt: null,
			rotationVersion: session.rotationVersion,
			sessionGeneration: readPasswordSessionGeneration(session),
		},
		where: { id: session.id },
	})) !== null

/** Inserts one fresh opaque session and returns its one-time token. */
export const issuePasswordSession = async (
	collection: PasswordSessionCollection,
	userId: string,
	sessionGeneration: number,
	policy: ResolvedPasswordSessionPolicy,
	now: number = Date.now(),
): Promise<IssuedSession> => {
	const absoluteExpiresAt = new Date(
		now + policy.absoluteExpiresInMs,
	).toISOString()
	const expiresAt = new Date(now + policy.expiresInMs).toISOString()
	const id = randomUUID()
	const token = createPasswordSessionToken()
	const record = await privateStore(collection).insert({
		data: {
			absoluteExpiresAt,
			createdAt: new Date(now).toISOString(),
			expiresAt,
			id,
			revokedAt: null,
			rotationVersion: 0,
			sessionGeneration,
			tokenDigest: token.digest,
			userId,
		},
	})
	return immutableRecord({
		context: toContextSession(record),
		issued: immutableRecord({
			absoluteExpiresAt,
			expiresAt,
			id,
			token: token.token,
		}),
	})
}

/** Resolves one valid raw token without writing last-used state. */
export const validatePasswordSessionToken = async (
	collection: PasswordSessionCollection,
	credentials: PasswordCredentialCollection,
	token: unknown,
	now: number = Date.now(),
): Promise<
	| Readonly<{
			readonly context: PasswordSession
			readonly userId: string
	  }>
	| undefined
> => {
	if (!isPasswordSessionToken(token)) return undefined
	const record = await privateStore(collection).findUnique({
		where: { tokenDigest: digestPasswordSessionToken(token) },
	})
	if (record === null || !isActive(record, now)) return undefined
	const credential = await findPasswordCredentialByUserId(
		credentials,
		record.userId,
	)
	if (credential?.sessionGeneration !== record.sessionGeneration) {
		return undefined
	}
	return immutableRecord({
		context: toContextSession(record),
		userId: record.userId,
	})
}

/** Moves only the unchanged current session to a newly issued account generation. */
export const advanceCurrentPasswordSessionGeneration = (
	collection: PasswordSessionCollection,
	session: PasswordSession,
	sessionGeneration: number,
	now: number = Date.now(),
): Promise<boolean> =>
	swapUnchangedSession(collection, session, { sessionGeneration }, now)

/** Revokes only the unchanged current session selected by its safe context. */
export const revokePasswordSession = (
	collection: PasswordSessionCollection,
	session: PasswordSession,
	now: number = Date.now(),
): Promise<boolean> =>
	swapUnchangedSession(
		collection,
		session,
		{ revokedAt: new Date(now).toISOString() },
		now,
	)

/** Rotates one unchanged live session through compare-and-swap. */
export const rotatePasswordSession = async (
	collection: PasswordSessionCollection,
	session: PasswordSession,
	policy: ResolvedPasswordSessionPolicy,
	now: number = Date.now(),
): Promise<(IssuedSession & Readonly<{ userId: string }>) | undefined> => {
	const record = await findUnchangedSession(collection, session, now)
	if (record === undefined) return undefined
	const token = createPasswordSessionToken()
	const updated = await privateStore(collection).compareAndSwap({
		data: {
			expiresAt: new Date(
				Math.min(
					now + policy.expiresInMs,
					Date.parse(record.absoluteExpiresAt),
				),
			).toISOString(),
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
