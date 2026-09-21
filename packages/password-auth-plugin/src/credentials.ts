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
import { immutableRecord } from '@ultimabase/shared'

import type { ResolvedPasswordHashPolicy } from './password-policy.js'

type RequiredFieldState<TImmutable extends boolean> = ScalarFieldTypegenState<
	true,
	false,
	TImmutable,
	false
>

type PasswordCredentialFields = Readonly<{
	readonly passwordVerifier: StringField<RequiredFieldState<false>>
	readonly policyVersion: IntField<RequiredFieldState<false>>
	readonly userId: UuidField<RequiredFieldState<true>>
	readonly username: StringField<RequiredFieldState<true>>
}>

const createCredentialFields = (): PasswordCredentialFields => ({
	passwordVerifier: stringField({ required: true }),
	policyVersion: intField({ required: true }),
	userId: uuidField({ immutable: true, required: true }),
	username: stringField({ immutable: true, required: true }),
})

/** Represents the exact package-private credential collection token. */
export type PasswordCredentialCollection = PrivateCollection<
	ReturnType<typeof createCredentialFields>,
	readonly [
		Readonly<{ readonly fields: readonly ['username'] }>,
		Readonly<{ readonly fields: readonly ['userId'] }>,
	]
>

/** Carries the private verifier and identity needed to create one credential record. */
export interface CreatePasswordCredentialInput {
	readonly passwordVerifier: string
	readonly policyVersion: number
	readonly userId: string
	readonly username: string
}

/** Builds one descriptor after the exact configured User schema is known. */
export const createPasswordCredentialCollection = (
	user: SchemaDefinition,
	policy: ResolvedPasswordHashPolicy,
): PasswordCredentialCollection =>
	definePrivateCollection({
		contributionId: 'credentials',
		fields: createCredentialFields(),
		indexes: [{ fields: ['username'] }, { fields: ['userId'] }] as const,
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
		protocolVersion: 1,
		references: [{ field: 'userId', onDelete: 'cascade', target: user }],
	})

/** Inserts one verifier record through the current owner-attributed request. */
export const insertPasswordCredential = (
	collection: PasswordCredentialCollection,
	input: CreatePasswordCredentialInput,
): Promise<PrivateCollectionRecord<PasswordCredentialCollection>> =>
	privateStore(collection).insert({ data: immutableRecord(input) })

/** Finds one verifier without revealing arbitrary private query access. */
export const findPasswordCredentialByUsername = (
	collection: PasswordCredentialCollection,
	username: string,
): Promise<PrivateCollectionRecord<PasswordCredentialCollection> | null> =>
	privateStore(collection).findUnique({ where: { username } })

/** Replaces an unchanged verifier while rejecting concurrent credential updates. */
export const upgradePasswordCredential = (
	collection: PasswordCredentialCollection,
	current: CreatePasswordCredentialInput,
	next: Readonly<{
		readonly passwordVerifier: string
		readonly policyVersion: number
	}>,
): Promise<PrivateCollectionRecord<PasswordCredentialCollection> | null> =>
	privateStore(collection).compareAndSwap({
		data: next,
		expected: {
			passwordVerifier: current.passwordVerifier,
			policyVersion: current.policyVersion,
		},
		where: { userId: current.userId },
	})
