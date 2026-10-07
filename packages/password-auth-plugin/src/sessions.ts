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
	createPasswordSessionId,
	createPasswordSessionToken,
	digestPasswordSessionToken,
	isPasswordSessionToken,
	readPasswordSessionGeneration,
	type IssuedPasswordSession,
	type PasswordSession,
} from './session.js'

type RequiredFieldState<TImmutable extends boolean> = ScalarFieldTypegenState<
	true,
	false,
	TImmutable,
	false
>
type OptionalFieldState<TImmutable extends boolean> = ScalarFieldTypegenState<
	false,
	false,
	TImmutable,
	false
>

type PasswordSessionFields = Readonly<{
	absoluteExpiresAt: DateTimeField<RequiredFieldState<true>>
	createdAt: DateTimeField<RequiredFieldState<true>>
	expiresAt: DateTimeField<RequiredFieldState<false>>
	id: UuidField<RequiredFieldState<true>>
	revokedAt: DateTimeField<OptionalFieldState<false>>
	rotationVersion: IntField<RequiredFieldState<false>>
	sessionGeneration: IntField<RequiredFieldState<false>>
	tokenDigest: StringField<RequiredFieldState<false>>
	userId: UuidField<RequiredFieldState<true>>
}>

const createSessionFields = (): PasswordSessionFields => ({
	absoluteExpiresAt: dateTimeField({ immutable: true, required: true }),
	createdAt: dateTimeField({ immutable: true, required: true }),
	expiresAt: dateTimeField({ required: true }),
	id: uuidField({ immutable: true, required: true }),
	revokedAt: dateTimeField(),
	rotationVersion: intField({ required: true }),
	sessionGeneration: intField({ required: true }),
	tokenDigest: stringField({ required: true }),
	userId: uuidField({ immutable: true, required: true }),
})

/** Represents the exact package-private session collection token. */
export type PasswordSessionCollection = PrivateCollection<
	ReturnType<typeof createSessionFields>,
	readonly [
		Readonly<{ readonly fields: readonly ['id'] }>,
		Readonly<{ readonly fields: readonly ['tokenDigest'] }>,
	]
>

/** Builds one private session descriptor for the configured User identity. */
export const createPasswordSessionCollection = (
	user: SchemaDefinition,
	policy: ResolvedPasswordSessionPolicy,
): PasswordSessionCollection =>
	definePrivateCollection({
		contributionId: 'sessions',
		fields: createSessionFields(),
		indexes: [{ fields: ['id'] }, { fields: ['tokenDigest'] }] as const,
		normalizedStaticOptions: {
			absoluteExpiresInMs: policy.absoluteExpiresInMs,
			expiresInMs: policy.expiresInMs,
		},
		protocolVersion: 2,
		references: [{ field: 'userId', onDelete: 'cascade', target: user }],
	})

const isActive = (
	record: PrivateCollectionRecord<PasswordSessionCollection>,
	now: number,
): boolean =>
	record.revokedAt === null &&
	Date.parse(record.expiresAt) > now &&
	Date.parse(record.absoluteExpiresAt) > now

const toContextSession = (
	record: PrivateCollectionRecord<PasswordSessionCollection>,
): PasswordSession =>
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

/** Inserts one fresh opaque session and returns its one-time token. */
export const issuePasswordSession = async (
	collection: PasswordSessionCollection,
	userId: string,
	sessionGeneration: number,
	policy: ResolvedPasswordSessionPolicy,
	now: number = Date.now(),
): Promise<
	Readonly<{
		readonly context: PasswordSession
		readonly issued: IssuedPasswordSession
	}>
> => {
	const createdAt = new Date(now).toISOString()
	const expiresAt = new Date(now + policy.expiresInMs).toISOString()
	const absoluteExpiresAt = new Date(
		now + policy.absoluteExpiresInMs,
	).toISOString()
	const id = createPasswordSessionId()
	const token = createPasswordSessionToken()
	const record = await privateStore(collection).insert({
		data: {
			absoluteExpiresAt,
			createdAt,
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
export const advanceCurrentPasswordSessionGeneration = async (
	collection: PasswordSessionCollection,
	session: PasswordSession,
	sessionGeneration: number,
	now: number = Date.now(),
): Promise<boolean> => {
	const currentGeneration = readPasswordSessionGeneration(session)
	const record = await privateStore(collection).findUnique({
		where: { id: session.id },
	})
	if (
		record === null ||
		!isActive(record, now) ||
		record.rotationVersion !== session.rotationVersion ||
		record.sessionGeneration !== currentGeneration
	) {
		return false
	}
	return (
		(await privateStore(collection).compareAndSwap({
			data: { sessionGeneration },
			expected: {
				revokedAt: null,
				rotationVersion: session.rotationVersion,
				sessionGeneration: currentGeneration,
			},
			where: { id: session.id },
		})) !== null
	)
}

/** Revokes only the unchanged current session selected by its safe context. */
export const revokePasswordSession = async (
	collection: PasswordSessionCollection,
	session: PasswordSession,
	now: number = Date.now(),
): Promise<boolean> => {
	const sessionGeneration = readPasswordSessionGeneration(session)
	const record = await privateStore(collection).findUnique({
		where: { id: session.id },
	})
	if (
		record === null ||
		!isActive(record, now) ||
		record.rotationVersion !== session.rotationVersion ||
		record.sessionGeneration !== sessionGeneration
	) {
		return false
	}
	return (
		(await privateStore(collection).compareAndSwap({
			data: { revokedAt: new Date(now).toISOString() },
			expected: {
				revokedAt: null,
				rotationVersion: session.rotationVersion,
				sessionGeneration,
			},
			where: { id: session.id },
		})) !== null
	)
}

/** Rotates one unchanged live session through compare-and-swap. */
export const rotatePasswordSession = async (
	collection: PasswordSessionCollection,
	session: PasswordSession,
	policy: ResolvedPasswordSessionPolicy,
	now: number = Date.now(),
): Promise<
	| Readonly<{
			readonly context: PasswordSession
			readonly issued: IssuedPasswordSession
			readonly userId: string
	  }>
	| undefined
> => {
	const sessionGeneration = readPasswordSessionGeneration(session)
	const store = privateStore(collection)
	const record = await store.findUnique({ where: { id: session.id } })
	if (
		record === null ||
		!isActive(record, now) ||
		record.rotationVersion !== session.rotationVersion ||
		record.sessionGeneration !== sessionGeneration
	) {
		return undefined
	}
	const token = createPasswordSessionToken()
	const expiresAt = new Date(
		Math.min(now + policy.expiresInMs, Date.parse(record.absoluteExpiresAt)),
	).toISOString()
	const rotationVersion = record.rotationVersion + 1
	const updated = await store.compareAndSwap({
		data: {
			expiresAt,
			rotationVersion,
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
