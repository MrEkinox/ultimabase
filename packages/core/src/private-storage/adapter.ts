import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

import type { PluginIdentity } from '../plugins/manifest.js'
import type { FieldValidationPlan } from '../schema/plans/contracts.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type { JsonValue } from '../schema/fields/builtins/json.js'

/** Retains one field and its Core-compiled structural plan for an adapter. */
export interface PrivateStorageAdapterField {
	readonly create: FieldValidationPlan
	readonly update: FieldValidationPlan
}

/** Carries portable referential integrity without adding a public relationship. */
export interface PrivateStorageAdapterReference {
	readonly field: string
	readonly onDelete: 'cascade' | 'fail'
	readonly target: SchemaDefinition
}

/** Supplies a selected adapter with one fully attributed private collection. */
export interface PrivateStorageAdapterCollection {
	readonly contributionId: string
	readonly fields: Readonly<Record<string, PrivateStorageAdapterField>>
	readonly indexes: readonly Readonly<{ readonly fields: readonly string[] }>[]
	readonly normalizedStaticOptions: Readonly<Record<string, JsonValue>>
	readonly owner: PluginIdentity
	readonly packageVersion: string
	readonly protocolVersion: number
	readonly references: readonly PrivateStorageAdapterReference[]
}

interface PrivateStorageOperationBase {
	readonly collection: PrivateStorageAdapterCollection
}

type PrivateStorageOperationRequest =
	| (PrivateStorageOperationBase &
			Readonly<{
				readonly kind: 'find-unique'
				readonly where: Readonly<Record<string, unknown>>
			}>)
	| (PrivateStorageOperationBase &
			Readonly<{
				readonly data: Readonly<Record<string, unknown>>
				readonly kind: 'insert'
			}>)
	| (PrivateStorageOperationBase &
			Readonly<{
				readonly data: Readonly<Record<string, unknown>>
				/** Inserts unless a unique index already holds the value; then resolves `null`. */
				readonly kind: 'insert-if-absent'
			}>)
	| (PrivateStorageOperationBase &
			Readonly<{
				readonly data: Readonly<Record<string, unknown>>
				readonly kind: 'update'
				readonly where: Readonly<Record<string, unknown>>
			}>)
	| (PrivateStorageOperationBase &
			Readonly<{
				readonly kind: 'delete'
				readonly where: Readonly<Record<string, unknown>>
			}>)
	| (PrivateStorageOperationBase &
			Readonly<{
				readonly data: Readonly<Record<string, unknown>>
				readonly expected: Readonly<Record<string, unknown>>
				readonly kind: 'compare-and-swap'
				readonly where: Readonly<Record<string, unknown>>
			}>)

/** Enumerates the deliberately bounded private persistence vocabulary. */
export type PrivateStorageOperationKind = PrivateStorageOperationRequest['kind']

/** Carries one exact Core-validated private request without a public Query AST. */
export type { PrivateStorageOperationRequest }

/** Executes already validated private records without exposing infrastructure upward. */
export interface PrivateStorageOperationExecutor {
	executePrivateStorage(
		request: PrivateStorageOperationRequest,
	): Promise<Readonly<Record<string, unknown>> | null>
}

/** Lets Core compile private descriptors before any setup or connection effect. */
export interface PrivateStorageDatabaseAdapter extends PrivateStorageOperationExecutor {
	configurePrivateStorage(
		collections: readonly PrivateStorageAdapterCollection[],
	): MaybePromise<void>
}

const privateStorageAdapters = new WeakMap<
	object,
	PrivateStorageOperationExecutor
>()

/**
 * Registers an adapter-owned implementation without adding a raw method to the
 * public database adapter object. Core remains the only reader of this binding.
 */
export const registerPrivateStorageAdapter: (
	adapter: object,
	implementation:
		PrivateStorageOperationExecutor | PrivateStorageDatabaseAdapter,
) => void = (adapter: unknown, implementation: unknown): void => {
	if (typeof adapter !== 'object' || adapter === null) {
		throw new TypeError('Private storage requires an adapter object')
	}
	if (
		typeof implementation !== 'object' ||
		implementation === null ||
		!('executePrivateStorage' in implementation) ||
		typeof implementation.executePrivateStorage !== 'function'
	) {
		throw new TypeError(
			'Private storage implementation requires executePrivateStorage',
		)
	}
	if (privateStorageAdapters.has(adapter)) {
		throw new TypeError('Private storage adapter is already registered')
	}
	const checked = implementation as PrivateStorageOperationExecutor &
		Partial<PrivateStorageDatabaseAdapter>
	const configure =
		typeof checked.configurePrivateStorage === 'function'
			? checked.configurePrivateStorage
			: undefined
	privateStorageAdapters.set(
		adapter,
		immutableRecord({
			...(configure === undefined
				? {}
				: {
						configurePrivateStorage: (
							collections: readonly PrivateStorageAdapterCollection[],
						) => configure.call(checked, collections),
					}),
			executePrivateStorage: (request) =>
				checked.executePrivateStorage(request),
		}),
	)
}

/** @internal Resolves only the exact adapter object selected by Core. */
export const readRegisteredPrivateStorageAdapter = (
	adapter: object,
): PrivateStorageOperationExecutor | undefined =>
	privateStorageAdapters.get(adapter)
