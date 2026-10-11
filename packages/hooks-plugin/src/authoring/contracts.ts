import type { MaybePromise } from '@ultimabase/shared'

import type {
	NumericUpdateFieldName,
	NumericUpdateOperation,
	SchemaDefinition,
	SchemaItem,
	SchemaPreparedDraft,
	SchemaRelationFieldName,
	SchemaResult,
	SchemaStoredCreateData,
	SchemaStoredUpdateData,
} from '@ultimabase/core'
import type { HookContext } from '../context/hook-context.js'
import type {
	SchemaAfterCommitHooks,
	SchemaAfterOperationHooks,
	SchemaBeforeOperationHooks,
} from './schema-mutation-contracts.js'

/** Names one item-oriented mutation independently from its internal terminal. */
export type SchemaMutationKind = 'create' | 'delete' | 'update' | 'upsert'

/** Declares one handler or a non-empty immutable sequence of handlers. */
export type HookHandlerDeclaration<THandler> =
	THandler | readonly [THandler, ...THandler[]]

/** Requires one documented family branch while preserving its original property type. */
type RequireAtLeastOne<TFamily extends object> = {
	[TKey in keyof TFamily]-?: Required<Pick<TFamily, TKey>> &
		Partial<Omit<TFamily, TKey>>
}[keyof TFamily]

interface SaveHookFamilyOptions<TAll, TCreate, TUpdate, TUpsert> {
	/** Runs for every create, update, and upsert, before the operation's own branch. */
	readonly all?: HookHandlerDeclaration<TAll>
	/** Runs only for create operations. */
	readonly create?: HookHandlerDeclaration<TCreate>
	/** Runs only for update operations. */
	readonly update?: HookHandlerDeclaration<TUpdate>
	/** Runs only for upsert operations. */
	readonly upsert?: HookHandlerDeclaration<TUpsert>
}

/** Specializes a save-wide handler without accepting an empty declaration. */
export type SaveHookFamily<TAll, TCreate, TUpdate, TUpsert> = RequireAtLeastOne<
	SaveHookFamilyOptions<TAll, TCreate, TUpdate, TUpsert>
>

/**
 * The values of a create as they will be stored: a `{ connect }` link is the
 * Pointer it names.
 */
export type HookCreateData<TSchema extends SchemaDefinition> =
	SchemaStoredCreateData<TSchema>

/**
 * The link changes an update makes on one relation field, as object ids; a
 * `set` is shown as its difference with the current members (ADR-0318).
 */
export interface HookRelationChanges {
	/** Targets this update links. */
	readonly connect: readonly string[]
	/** Targets this update unlinks. */
	readonly disconnect: readonly string[]
}

type StoredUpdateValue<
	TSchema extends SchemaDefinition,
	TKey extends keyof SchemaStoredUpdateData<TSchema>,
> = Exclude<SchemaStoredUpdateData<TSchema>[TKey], undefined>

type NumericChange<TSchema extends SchemaDefinition, TKey> =
	TKey extends NumericUpdateFieldName<TSchema>
		? NumericUpdateOperation<
				Exclude<SchemaStoredUpdateData<TSchema>[TKey], null | undefined>
			>
		: never

/**
 * The fields one update changes, and only those: a new value, an atomic
 * `{ increment }` / `{ decrement }`, or a relation's link changes.
 *
 * @example `{ title: 'Renamed', views: { increment: 1 } }`
 */
export type HookChanges<TSchema extends SchemaDefinition> = {
	readonly [TKey in keyof SchemaStoredUpdateData<TSchema>]?:
		StoredUpdateValue<TSchema, TKey> | NumericChange<TSchema, TKey>
} & RelationChangeFields<TSchema>

/** Relation link changes, only when the schema's relation names are known. */
type RelationChangeFields<TSchema extends SchemaDefinition> =
	string extends SchemaRelationFieldName<TSchema>
		? unknown
		: Readonly<
				Partial<Record<SchemaRelationFieldName<TSchema>, HookRelationChanges>>
			>

/** What `resolveInput.create` receives. */
export interface SchemaResolveCreateInput<TSchema extends SchemaDefinition> {
	/** Request identity and hook capabilities. */
	readonly context: HookContext
	readonly kind: 'create'
	/** The values to create; return a replacement to change them. */
	readonly data: HookCreateData<TSchema>
}

/** What `resolveInput.update` receives. */
export interface SchemaResolveUpdateInput<TSchema extends SchemaDefinition> {
	/** Request identity and hook capabilities. */
	readonly context: HookContext
	readonly kind: 'update'
	/** Only what the update changes; return a replacement to change it. */
	readonly changes: HookChanges<TSchema>
	/** The object before the update, locked by the transaction. */
	readonly originalItem: SchemaResult<TSchema>
}

/** What `resolveInput.upsert` receives. */
export interface SchemaResolveUpsertInput<TSchema extends SchemaDefinition> {
	/** Request identity and hook capabilities. */
	readonly context: HookContext
	readonly kind: 'upsert'
	/** `create` when no object matches, `update` otherwise. */
	readonly mode: 'create' | 'update'
	/** The values created when no object matches. */
	readonly data: HookCreateData<TSchema>
	/** The changes applied when an object matches. */
	readonly changes: HookChanges<TSchema>
	/** The matching object, or `null` when the upsert creates. */
	readonly originalItem: SchemaResult<TSchema> | null
}

/** What an upsert `resolveInput` returns to replace both of its branches. */
export interface SchemaUpsertResolution<TSchema extends SchemaDefinition> {
	readonly data: HookCreateData<TSchema>
	readonly changes: HookChanges<TSchema>
}

/** What `resolveInput.all` receives: one of the three save inputs. */
export type SchemaResolveInputHookInput<TSchema extends SchemaDefinition> =
	| SchemaResolveCreateInput<TSchema>
	| SchemaResolveUpdateInput<TSchema>
	| SchemaResolveUpsertInput<TSchema>

/** Replaces the values of a create; `undefined` keeps them. */
export type SchemaResolveCreateHook<TSchema extends SchemaDefinition> = (
	input: SchemaResolveCreateInput<TSchema>,
) => MaybePromise<HookCreateData<TSchema> | undefined>

/** Replaces the changes of an update; `undefined` keeps them. */
export type SchemaResolveUpdateHook<TSchema extends SchemaDefinition> = (
	input: SchemaResolveUpdateInput<TSchema>,
) => MaybePromise<HookChanges<TSchema> | undefined>

/** Replaces both branches of an upsert; `undefined` keeps them. */
export type SchemaResolveUpsertHook<TSchema extends SchemaDefinition> = (
	input: SchemaResolveUpsertInput<TSchema>,
) => MaybePromise<SchemaUpsertResolution<TSchema> | undefined>

/**
 * Runs for every save: return the data, changes or upsert pair matching
 * `kind`, or `undefined` to keep the input.
 */
export type SchemaResolveInputHook<TSchema extends SchemaDefinition> = (
	input: SchemaResolveInputHookInput<TSchema>,
) => MaybePromise<
	| HookCreateData<TSchema>
	| HookChanges<TSchema>
	| SchemaUpsertResolution<TSchema>
	| undefined
>

/** Declares input resolution directly (for every save), as a list, or by operation. */
export type SchemaResolveInputHookDeclaration<
	TSchema extends SchemaDefinition,
> =
	| HookHandlerDeclaration<SchemaResolveInputHook<TSchema>>
	| SaveHookFamily<
			SchemaResolveInputHook<TSchema>,
			SchemaResolveCreateHook<TSchema>,
			SchemaResolveUpdateHook<TSchema>,
			SchemaResolveUpsertHook<TSchema>
	  >

/** What `beforeOperation.create` receives. */
export interface SchemaBeforeCreateHookInput<TSchema extends SchemaDefinition> {
	/** Request identity and hook capabilities. */
	readonly context: HookContext
	readonly kind: 'create'
	/** The complete candidate about to be stored. */
	readonly item: SchemaPreparedDraft<TSchema>
}

/** What `beforeOperation.update` receives. */
export interface SchemaBeforeUpdateHookInput<TSchema extends SchemaDefinition> {
	/** Request identity and hook capabilities. */
	readonly context: HookContext
	readonly kind: 'update'
	/** The complete object as the update will store it. */
	readonly item: Readonly<SchemaItem<TSchema>>
	/** The object before the update, locked by the transaction. */
	readonly originalItem: SchemaResult<TSchema>
	/** Only what the update changes, relation links included. */
	readonly changes: HookChanges<TSchema>
}

/** What `beforeOperation.upsert` receives. */
export interface SchemaBeforeUpsertHookInput<TSchema extends SchemaDefinition> {
	/** Request identity and hook capabilities. */
	readonly context: HookContext
	readonly kind: 'upsert'
	/** `create` when no object matches, `update` otherwise. */
	readonly mode: 'create' | 'update'
	/** The complete object as the upsert will store it. */
	readonly item: Readonly<SchemaItem<TSchema>>
	/** The matching object, or `null` when the upsert creates. */
	readonly originalItem: SchemaResult<TSchema> | null
}

/** What `beforeOperation.delete` receives. */
export interface SchemaBeforeDeleteHookInput<TSchema extends SchemaDefinition> {
	/** Request identity and hook capabilities. */
	readonly context: HookContext
	readonly kind: 'delete'
	readonly item: null
	/** The object about to be deleted, locked by the transaction. */
	readonly originalItem: SchemaResult<TSchema>
}

/** What `beforeOperation.all` receives: one of the four native inputs. */
export type SchemaBeforeOperationHookInput<TSchema extends SchemaDefinition> =
	| SchemaBeforeCreateHookInput<TSchema>
	| SchemaBeforeUpdateHookInput<TSchema>
	| SchemaBeforeUpsertHookInput<TSchema>
	| SchemaBeforeDeleteHookInput<TSchema>

/** What `afterOperation.create` and `afterCommit.create` receive. */
export interface SchemaAfterCreateHookInput<TSchema extends SchemaDefinition> {
	/** Request identity and hook capabilities. */
	readonly context: HookContext
	readonly kind: 'create'
	/** The stored object. */
	readonly item: SchemaResult<TSchema>
	readonly originalItem: null
}

/** What `afterOperation.update` and `afterCommit.update` receive. */
export interface SchemaAfterUpdateHookInput<TSchema extends SchemaDefinition> {
	/** Request identity and hook capabilities. */
	readonly context: HookContext
	readonly kind: 'update'
	/** The stored object. */
	readonly item: SchemaResult<TSchema>
	/** The object before the update. */
	readonly originalItem: SchemaResult<TSchema>
	/** Only what the update changed, relation links included. */
	readonly changes: HookChanges<TSchema>
}

/** What `afterOperation.upsert` and `afterCommit.upsert` receive. */
export interface SchemaAfterUpsertHookInput<TSchema extends SchemaDefinition> {
	/** Request identity and hook capabilities. */
	readonly context: HookContext
	readonly kind: 'upsert'
	/** `create` when no object matched, `update` otherwise. */
	readonly mode: 'create' | 'update'
	/** The stored object. */
	readonly item: SchemaResult<TSchema>
	/** The matched object, or `null` when the upsert created. */
	readonly originalItem: SchemaResult<TSchema> | null
}

/** What `afterOperation.delete` and `afterCommit.delete` receive. */
export interface SchemaAfterDeleteHookInput<TSchema extends SchemaDefinition> {
	/** Request identity and hook capabilities. */
	readonly context: HookContext
	readonly kind: 'delete'
	readonly item: null
	/** The deleted object. */
	readonly originalItem: SchemaResult<TSchema>
}

/** What `afterOperation.all` and `afterCommit.all` receive: one of the four native inputs. */
export type SchemaAfterOperationHookInput<TSchema extends SchemaDefinition> =
	| SchemaAfterCreateHookInput<TSchema>
	| SchemaAfterUpdateHookInput<TSchema>
	| SchemaAfterUpsertHookInput<TSchema>
	| SchemaAfterDeleteHookInput<TSchema>

/** Observes or rejects one operation; returning a value has no effect. */
export type SchemaOperationHook<TInput> = (input: TInput) => MaybePromise<void>

/**
 * Declares schema-owned business behavior run around each operation
 * (ADR-0318).
 *
 * Every phase accepts `all`, which runs before the operation's own branch.
 * `resolveInput`, `beforeOperation` and `afterOperation` run inside the
 * transaction and may replay after a transient conflict (ADR-0300): external
 * effects belong in `afterCommit` or events.
 */
export interface SchemaHooks<TSchema extends SchemaDefinition> {
	/**
	 * Changes the data of a create, the changes of an update, or both branches
	 * of an upsert, before validation.
	 *
	 * @example `resolveInput: { create: ({ data }) => ({ ...data, slug: slugify(data.title) }) }`
	 */
	readonly resolveInput?: SchemaResolveInputHookDeclaration<TSchema>
	/**
	 * Observes or rejects an operation once its items are known, before it is stored.
	 * @example `beforeOperation: { update: ({ originalItem, item }) => audit(originalItem, item) }`
	 */
	readonly beforeOperation?: SchemaBeforeOperationHooks<TSchema>
	/**
	 * Observes or rejects a stored operation before the transaction commits.
	 * @example `afterOperation: { create: ({ item }) => audit(item) }`
	 */
	readonly afterOperation?: SchemaAfterOperationHooks<TSchema>
	/**
	 * Runs after the transaction commits, outside it, without delaying the
	 * response; a failure is logged. Delivery is best effort in this process.
	 * @example `afterCommit: { create: ({ item }) => sendWelcomeEmail(item.email) }`
	 */
	readonly afterCommit?: SchemaAfterCommitHooks<TSchema>
}
