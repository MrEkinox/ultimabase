import {
	booleanField,
	dateTimeField,
	FrameworkError,
	type BooleanField,
	type DatabaseMutationOperationAst,
	type DateTimeField,
	type GenericField,
	type SchemaReference,
} from '@ultimabase/core'
import {
	RequestContextValue,
	type RequestContext,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { readCreateInputs } from './foundation-routes.js'

/** The typing state of a field only the authentication flows write. */
interface ManagedFieldState<TNullable extends boolean> {
	readonly create: 'forbidden'
	readonly list: false
	readonly nullable: TNullable
	readonly object: 'required'
	readonly update: 'forbidden'
}

/**
 * The User fields the foundation adds beside a method's `email` (ADR-0326):
 * whether the current email is verified, and since when. Only the
 * authentication flows write them.
 */
export type AuthEmailVerificationFields = Readonly<{
	/** Whether the current `email` is verified. */
	emailVerified: BooleanField<ManagedFieldState<false>>
	/** When the current `email` was verified, or `null`. */
	emailVerifiedAt: DateTimeField<ManagedFieldState<true>>
}>

/** The User fields only the authentication flows write. */
export const emailVerificationFieldNames: readonly string[] = [
	'emailVerified',
	'emailVerifiedAt',
]

/** Creates the verification fields added to a User whose method owns `email`. */
export const createEmailVerificationFields = (): Readonly<
	Record<string, GenericField>
> =>
	immutableRecord({
		emailVerified: booleanField({ default: false, required: true }),
		emailVerifiedAt: dateTimeField(),
	})

/** A User row as the foundation reads it for application callbacks. */
export type AuthUserRecord = Readonly<Record<string, unknown>> &
	Readonly<{ readonly id: string }>

// Only this module holds the marker: the writes it allows are the
// authentication flows' own.
const managedWriteBrand: unique symbol = Symbol('AuthManagedWrite')
interface ManagedWrite {
	readonly [managedWriteBrand]: true
}
const managedWrite: ManagedWrite = Object.freeze({
	[managedWriteBrand]: true as const,
})
const managedWriteValue = new RequestContextValue<
	ManagedWrite,
	'ultimabase.auth.managed-write'
>('ultimabase.auth.managed-write', (value) => {
	if (value !== managedWrite) {
		throw new TypeError('Auth managed writes are package-owned')
	}
	return managedWrite
})

const readUpdateExpressionFields = (update: unknown): readonly string[] => {
	const operations: unknown = isPlainRecord(update)
		? update.operations
		: undefined
	return Array.isArray(operations)
		? operations.flatMap((operation: unknown) =>
				isPlainRecord(operation) && typeof operation.field === 'string'
					? [operation.field]
					: [],
			)
		: []
}

/** Reads the fields every update (and upsert update) of a mutation writes. */
const readUpdatedFields = (
	operation: DatabaseMutationOperationAst,
): readonly string[] => {
	const value: unknown = operation
	if (!isPlainRecord(value)) return []
	switch (operation.kind) {
		case 'update-one':
		case 'update-many':
		case 'upsert-one':
			return readUpdateExpressionFields(value.update)
		case 'upsert-many':
			return Array.isArray(value.items)
				? value.items.flatMap((item: unknown) =>
						isPlainRecord(item) ? readUpdateExpressionFields(item.update) : [],
					)
				: []
		default:
			return []
	}
}

const rejectProtectedField = (field: string): never => {
	const message = `${field} is written only by the authentication flows`
	throw new FrameworkError('VALIDATION_ERROR', message, {
		publicMessage: 'The operation input is invalid.',
		publicDetails: {
			issues: [{ code: 'field.protected', message, path: [field] }],
		},
	})
}

/**
 * Rejects writes of the protected email fields outside the authentication
 * flows, Master included: a create keeps the defaults, an update never
 * names them. The email stays in step with credentials and linked accounts.
 */
export const guardProtectedEmailFields = (
	operation: DatabaseMutationOperationAst,
	context: RequestContext,
	protectedFields: readonly string[],
): void => {
	if (context.getValue(managedWriteValue) !== undefined) return
	for (const data of readCreateInputs(operation)) {
		if (data.emailVerified !== undefined && data.emailVerified !== false) {
			rejectProtectedField('emailVerified')
		}
		if (data.emailVerifiedAt !== undefined && data.emailVerifiedAt !== null) {
			rejectProtectedField('emailVerifiedAt')
		}
	}
	const updated = readUpdatedFields(operation).find((field) =>
		protectedFields.includes(field),
	)
	if (updated !== undefined) rejectProtectedField(updated)
}

/** Reads one User row with the plugin's elevation, or `undefined`. */
export const readUserRecord = async (
	user: SchemaReference<string>,
	userId: string,
): Promise<AuthUserRecord | undefined> => {
	const record: unknown = await user.findOne(
		{ where: { id: userId } },
		{ useMasterKey: true },
	)
	return isPlainRecord(record) && typeof record.id === 'string'
		? (record as AuthUserRecord)
		: undefined
}

/** Writes protected User fields as the authentication flows, with elevation. */
export const writeUserEmailFields = async (
	user: SchemaReference<string>,
	userId: string,
	data: Readonly<Record<string, unknown>>,
	context: RequestContext,
): Promise<void> => {
	await user.updateOne(
		{ data, select: { id: true }, where: { id: userId } },
		{
			context: context.withValue(managedWriteValue, managedWrite),
			useMasterKey: true,
		},
	)
}
