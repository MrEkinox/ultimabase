import {
	booleanField,
	dateTimeField,
	definePrivateCollection,
	intField,
	stringField,
	uuidField,
	type BooleanField,
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

type RequiredState<TImmutable extends boolean> = ScalarFieldTypegenState<
	true,
	false,
	TImmutable,
	false
>
type Optional = ScalarFieldTypegenState<false, false, false, false>

type SessionFields = Readonly<{
	absoluteExpiresAt: DateTimeField<RequiredState<true>>
	address: StringField<Optional>
	authenticatedAt: DateTimeField<RequiredState<false>>
	createdAt: DateTimeField<RequiredState<true>>
	expiresAt: DateTimeField<RequiredState<false>>
	id: UuidField<RequiredState<true>>
	lastUsedAt: DateTimeField<RequiredState<false>>
	method: StringField<RequiredState<true>>
	revokedAt: DateTimeField<Optional>
	rotationVersion: IntField<RequiredState<false>>
	sessionGeneration: IntField<RequiredState<false>>
	tokenDigest: StringField<RequiredState<false>>
	userAgent: StringField<Optional>
	userId: UuidField<RequiredState<true>>
}>

const sessionFields = (): SessionFields => ({
	absoluteExpiresAt: dateTimeField({ immutable: true, required: true }),
	address: stringField(),
	authenticatedAt: dateTimeField({ required: true }),
	createdAt: dateTimeField({ immutable: true, required: true }),
	expiresAt: dateTimeField({ required: true }),
	id: uuidField({ immutable: true, required: true }),
	lastUsedAt: dateTimeField({ required: true }),
	method: stringField({ immutable: true, required: true }),
	revokedAt: dateTimeField(),
	rotationVersion: intField({ required: true }),
	sessionGeneration: intField({ required: true }),
	tokenDigest: stringField({ required: true }),
	userAgent: stringField(),
	userId: uuidField({ immutable: true, required: true }),
})

/** The private sessions shared by every method. */
export type SessionCollection = PrivateCollection<
	SessionFields,
	readonly [
		Readonly<{ readonly fields: readonly ['id'] }>,
		Readonly<{ readonly fields: readonly ['tokenDigest'] }>,
	]
>
export type SessionRecord = PrivateCollectionRecord<SessionCollection>

type UserStateFields = Readonly<{
	sessionGeneration: IntField<RequiredState<false>>
	userId: UuidField<RequiredState<true>>
}>

/** One row per user: advancing its generation revokes every session at once. */
export type UserStateCollection = PrivateCollection<
	UserStateFields,
	readonly [Readonly<{ readonly fields: readonly ['userId'] }>]
>

type AccountFields = Readonly<{
	createdAt: DateTimeField<RequiredState<true>>
	email: StringField<Optional>
	emailVerified: BooleanField<RequiredState<false>>
	id: UuidField<RequiredState<true>>
	method: StringField<RequiredState<true>>
	providerUserId: StringField<RequiredState<true>>
	userId: UuidField<RequiredState<true>>
}>

/** Linked accounts: one row per method account of a user (ADR-0326). */
export type AccountCollection = PrivateCollection<
	AccountFields,
	readonly [
		Readonly<{ readonly fields: readonly ['id'] }>,
		Readonly<{ readonly fields: readonly ['method', 'providerUserId'] }>,
	]
>
export type AccountRecord = PrivateCollectionRecord<AccountCollection>

type AttemptFields = Readonly<{
	failures: IntField<RequiredState<false>>
	key: StringField<RequiredState<true>>
	lockedUntil: DateTimeField<Optional>
	updatedAt: DateTimeField<RequiredState<false>>
}>

/** Failed-attempt counters, keyed by a digest of the account and address. */
export type AttemptCollection = PrivateCollection<
	AttemptFields,
	readonly [Readonly<{ readonly fields: readonly ['key'] }>]
>
export type AttemptRecord = PrivateCollectionRecord<AttemptCollection>

/** Every private collection of the foundation for one User schema. */
export interface AuthCollections {
	readonly accounts: AccountCollection
	readonly attempts: AttemptCollection
	readonly sessions: SessionCollection
	readonly states: UserStateCollection
}

const cascade = (user: SchemaDefinition) =>
	[{ field: 'userId', onDelete: 'cascade', target: user }] as const

/** Declares the foundation's private collections against the User schema. */
export const createAuthCollections = (
	user: SchemaDefinition,
): AuthCollections =>
	immutableRecord({
		accounts: definePrivateCollection({
			contributionId: 'accounts',
			fields: {
				createdAt: dateTimeField({ immutable: true, required: true }),
				email: stringField(),
				emailVerified: booleanField({ required: true }),
				id: uuidField({ immutable: true, required: true }),
				method: stringField({ immutable: true, required: true }),
				providerUserId: stringField({ immutable: true, required: true }),
				userId: uuidField({ immutable: true, required: true }),
			},
			indexes: [
				{ fields: ['id'] },
				{ fields: ['method', 'providerUserId'] },
			] as const,
			lookups: [{ fields: ['userId'] }, { fields: ['email'] }],
			references: cascade(user),
		}),
		attempts: definePrivateCollection({
			contributionId: 'attempts',
			fields: {
				failures: intField({ required: true }),
				key: stringField({ immutable: true, required: true }),
				lockedUntil: dateTimeField(),
				updatedAt: dateTimeField({ required: true }),
			},
			indexes: [{ fields: ['key'] }] as const,
		}),
		sessions: definePrivateCollection({
			contributionId: 'sessions',
			fields: sessionFields(),
			indexes: [{ fields: ['id'] }, { fields: ['tokenDigest'] }] as const,
			lookups: [{ fields: ['userId'] }],
			references: cascade(user),
		}),
		states: definePrivateCollection({
			contributionId: 'user-states',
			fields: {
				sessionGeneration: intField({ required: true }),
				userId: uuidField({ immutable: true, required: true }),
			},
			indexes: [{ fields: ['userId'] }] as const,
			references: cascade(user),
		}),
	})
