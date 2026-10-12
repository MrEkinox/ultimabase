import {
	definePrivateCollection,
	intField,
	privateStore,
	stringField,
	uuidField,
	type IntField,
	type PrivateCollection,
	type PrivateCollectionRecord,
	type ScalarFieldTypegenState,
	type SchemaDefinition,
	type StringField,
	type UuidField,
} from '@ultimabase/core'

import type { ResolvedPasswordHashPolicy } from './password-policy.js'

type RequiredState<TImmutable extends boolean> = ScalarFieldTypegenState<
	true,
	false,
	TImmutable,
	false
>

type CredentialFields = Readonly<{
	identifier: StringField<RequiredState<false>>
	passwordVerifier: StringField<RequiredState<false>>
	policyVersion: IntField<RequiredState<false>>
	userId: UuidField<RequiredState<true>>
}>

/** The private password verifiers, one per user. */
export type CredentialCollection = PrivateCollection<
	CredentialFields,
	readonly [
		Readonly<{ readonly fields: readonly ['identifier'] }>,
		Readonly<{ readonly fields: readonly ['userId'] }>,
	]
>

/** One stored verifier. */
export type CredentialRecord = PrivateCollectionRecord<CredentialCollection>

/** Declares the verifier collection against the User schema. */
export const createCredentialCollection = (
	user: SchemaDefinition,
	policy: ResolvedPasswordHashPolicy,
): CredentialCollection =>
	definePrivateCollection({
		contributionId: 'password-credentials',
		fields: {
			// An email identifier follows a confirmed email change.
			identifier: stringField({ required: true }),
			passwordVerifier: stringField({ required: true }),
			policyVersion: intField({ required: true }),
			userId: uuidField({ immutable: true, required: true }),
		},
		indexes: [{ fields: ['identifier'] }, { fields: ['userId'] }] as const,
		normalizedStaticOptions: {
			passwordPolicy: {
				algorithm: policy.algorithm,
				hashLength: policy.hashLength,
				memoryCostKiB: policy.memoryCostKiB,
				parallelism: policy.parallelism,
				policyVersion: policy.policyVersion,
				timeCost: policy.timeCost,
				version: policy.version,
			},
		},
		references: [{ field: 'userId', onDelete: 'cascade', target: user }],
	})

/** Replaces an unchanged verifier; `null` when a concurrent change won. */
export const swapCredential = (
	collection: CredentialCollection,
	current: CredentialRecord,
	next: Readonly<{ passwordVerifier: string; policyVersion: number }>,
): Promise<CredentialRecord | null> =>
	privateStore(collection).compareAndSwap({
		data: next,
		expected: {
			passwordVerifier: current.passwordVerifier,
			policyVersion: current.policyVersion,
		},
		where: { userId: current.userId },
	})
