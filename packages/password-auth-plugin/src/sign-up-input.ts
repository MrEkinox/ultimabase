import {
	Pointer,
	type FieldValueMap,
	type SchemaFields,
	type NestedPointerCreateInput,
	type NestedRelationCreateInput,
	type RelationField,
	type SchemaNestedCreateData,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { PasswordCredentialsInput } from './operations.js'

// Keep relationship commands identical to ordinary schema creation.
type CreateValue<TValue> =
	TValue extends Pointer<infer TTarget>
		? NestedPointerCreateInput<SchemaNestedCreateData<TTarget>>
		: TValue
type CreateValues<TValues> = {
	[TKey in keyof TValues]: CreateValue<TValues[TKey]>
}
type RelationInputs<TFields extends SchemaFields> = {
	[
		TKey in keyof TFields as TFields[TKey]['kind'] extends 'relation'
			? TKey
			: never
	]?: TFields[TKey] extends RelationField<infer TTarget>
		? NestedRelationCreateInput<SchemaNestedCreateData<TTarget>>
		: never
}

/** Adds the User's create fields to credentials, retaining required/default rules. */
export type PasswordSignUpInput<TFields extends SchemaFields = SchemaFields> =
	PasswordCredentialsInput &
		(string extends keyof TFields
			? Readonly<Record<string, unknown>>
			: CreateValues<FieldValueMap<TFields, 'create'>> &
					RelationInputs<TFields>)

// Byte snapshots stay opaque and immutable across the operation boundary. Only
// this module can recover a fresh native copy for the ordinary schema pipeline.
class SignUpBytes {
	readonly #value: Uint8Array
	constructor(value: Uint8Array) {
		this.#value = Uint8Array.from(value)
		Object.freeze(this)
	}
	copy(): Uint8Array {
		return Uint8Array.from(this.#value)
	}
}

const snapshotValue = (value: unknown, seen: Set<object>): unknown => {
	if (typeof value !== 'object' || value === null) {
		if (typeof value === 'function' || typeof value === 'symbol')
			throw new TypeError('Unsupported sign-up value')
		return value
	}
	if (value instanceof SignUpBytes || Pointer.is(value)) return value
	if (value instanceof Uint8Array) return new SignUpBytes(value)
	if (seen.has(value)) throw new TypeError('Cyclic sign-up input')
	seen.add(value)
	try {
		if (isUnknownArray(value))
			return immutableArray(
				value.map((item: unknown) => snapshotValue(item, seen)),
			)
		if (
			!isPlainRecord(value) ||
			Reflect.ownKeys(value).some((key) => typeof key !== 'string')
		)
			throw new TypeError('Sign-up values must be plain data')
		return immutableRecord(
			Object.fromEntries(
				Object.entries(value).map(([key, item]) => [
					key,
					snapshotValue(item, seen),
				]),
			),
		)
	} finally {
		seen.delete(value)
	}
}

/** Detaches user input before asynchronous credential work without running defaults. */
export const snapshotPasswordSignUpInput = (
	value: unknown,
	path: string,
): PasswordSignUpInput => {
	if (
		!isPlainRecord(value) ||
		typeof value.username !== 'string' ||
		typeof value.password !== 'string'
	) {
		throw new TypeError(
			`${path} must contain username and password beside User create fields`,
		)
	}
	return snapshotValue(value, new Set()) as PasswordSignUpInput
}

/** Restores native schema values only at the create boundary. */
export const restorePasswordSignUpValue = (value: unknown): unknown => {
	if (typeof value !== 'object' || value === null) return value
	if (value instanceof SignUpBytes) return value.copy()
	if (Pointer.is(value)) return value
	if (isUnknownArray(value))
		return value.map((item: unknown) => restorePasswordSignUpValue(item))
	if (!isPlainRecord(value)) throw new TypeError('Invalid sign-up snapshot')
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			key,
			restorePasswordSignUpValue(item),
		]),
	)
}
