import type { MaybePromise } from '@ultimabase/shared'

import type {
	OperationAst,
	OperationAstNode,
	OperationKind,
	NestedWriteGraph,
	QueryFieldName,
	QueryFilterNode,
	RelationUpdateExpression,
	SchemaDefinition,
	SchemaItem,
	SchemaPreparedDraft,
	SchemaResult,
	UpdateExpression,
} from '@ultimabase/core'
import type { HookContext } from '../context/hook-context.js'
import type {
	SchemaAfterOperationHooks,
	SchemaBeforeOperationHooks,
} from './schema-mutation-contracts.js'

/** Groups the terminal kinds that create persisted objects. */
export type SchemaCreateHookKind = 'create-many' | 'create-one'

/** Groups the terminal kinds that update existing objects. */
export type SchemaUpdateHookKind = 'update-many' | 'update-one'

/** Groups the terminal kinds that create or update through a unique target. */
export type SchemaUpsertHookKind = 'upsert-many' | 'upsert-one'

/** Groups the terminal kinds that remove persisted objects. */
export type SchemaDeleteHookKind = 'delete-many' | 'delete-one'

/** Groups every create, update, and upsert terminal. */
export type SchemaSaveHookKind =
	SchemaCreateHookKind | SchemaUpdateHookKind | SchemaUpsertHookKind

/** Groups every terminal whose business work participates in a transaction. */
export type SchemaMutationHookKind = SchemaDeleteHookKind | SchemaSaveHookKind

/** Groups mutations whose exact item pair is knowable before persistence. */
export type SchemaBeforeOperationHookKind =
	'create-one' | 'delete-one' | 'update-one'

/** Names one item-oriented mutation independently from its internal terminal. */
export type SchemaMutationKind = 'create' | 'delete' | 'update' | 'upsert'

/** Maps one normalized mutation terminal to its public item lifecycle name. */
export type SchemaMutationKindForOperation<
	TKind extends SchemaMutationHookKind,
> = TKind extends SchemaCreateHookKind
	? 'create'
	: TKind extends SchemaUpdateHookKind
		? 'update'
		: TKind extends SchemaUpsertHookKind
			? 'upsert'
			: 'delete'

/** Declares one handler or a non-empty immutable sequence of handlers. */
export type HookHandlerDeclaration<THandler> =
	THandler | readonly [THandler, ...THandler[]]

/** Requires one documented family branch while preserving its original property type. */
type RequireAtLeastOne<TFamily extends object> = {
	[TKey in keyof TFamily]-?: Required<Pick<TFamily, TKey>> &
		Partial<Omit<TFamily, TKey>>
}[keyof TFamily]

interface SaveHookFamilyOptions<TAll, TCreate, TUpdate, TUpsert> {
	/** Runs for every create, update, and upsert operation. */
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
 * Retains one schema's exact normalized operation while hiding internal Runtime types.
 *
 * `TSelectedField` remains generic because selection is known only when a query runs.
 */
export type SchemaHookOperation<
	TSchema extends SchemaDefinition,
	TKind extends OperationKind = OperationKind,
	TSelectedField extends QueryFieldName<TSchema> = QueryFieldName<TSchema>,
	TIncludedPointer = never,
> = Extract<
	OperationAst<
		TSchema,
		UpdateExpression<TSchema> | RelationUpdateExpression<TSchema>,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	>,
	{ readonly kind: TKind }
>

/** Describes one operation before its adapter result exists. */
export type SchemaOperationHookInput<
	TOperation extends OperationAstNode & {
		readonly kind: SchemaMutationHookKind
	},
> = TOperation extends OperationAstNode
	? Readonly<{
			/** Carries immutable request identity and revocable hook capabilities. */
			context: HookContext
			/** Identifies the item-oriented mutation independently from cardinality. */
			kind: SchemaMutationKindForOperation<TOperation['kind']>
			/** The immutable normalized operation being processed. */
			operation: TOperation
			/** Exposes the complete Core-owned graph only during a nested write. */
			readonly nestedWrite?: NestedWriteGraph
		}>
	: never

type SchemaResolveOriginalItem<
	TSchema extends SchemaDefinition,
	TKind extends 'create-one' | 'update-one' | 'upsert-one',
> = TKind extends 'create-one'
	? null
	: TKind extends 'update-one'
		? SchemaResult<TSchema>
		: SchemaResult<TSchema> | null

/** Supplies the stable visible preimage to one item-oriented input resolver. */
export type SchemaResolveInputHookInput<
	TSchema extends SchemaDefinition,
	TOperation extends SchemaHookOperation<
		TSchema,
		'create-one' | 'update-one' | 'upsert-one',
		QueryFieldName<TSchema>,
		unknown
	>,
> = TOperation extends OperationAstNode
	? SchemaOperationHookInput<TOperation> &
			Readonly<{
				/** Contains the locked existing object, or `null` for a create candidate. */
				originalItem: SchemaResolveOriginalItem<TSchema, TOperation['kind']>
			}>
	: never

/** Correlates one complete logical object across a materialized mutation. */
export interface SchemaMutationItemPair<
	TSchema extends SchemaDefinition,
	TOriginalItem extends object | null = SchemaResult<TSchema> | null,
	TItem extends object | null = Readonly<SchemaItem<TSchema>> | null,
> {
	/** Contains the object visible before persistence, or `null` for creation. */
	readonly originalItem: TOriginalItem
	/** Contains the candidate or persisted object, or `null` for deletion. */
	readonly item: TItem
}

type SchemaCreateItemPair<TSchema extends SchemaDefinition> =
	SchemaMutationItemPair<TSchema, null, Readonly<SchemaItem<TSchema>>>

type SchemaUpdateItemPair<TSchema extends SchemaDefinition> =
	SchemaMutationItemPair<
		TSchema,
		SchemaResult<TSchema>,
		Readonly<SchemaItem<TSchema>>
	>

type SchemaDeleteItemPair<TSchema extends SchemaDefinition> =
	SchemaMutationItemPair<TSchema, SchemaResult<TSchema>, null>

/** Supplies the final candidate to one item-oriented create observer. */
export interface SchemaBeforeCreateHookInput<TSchema extends SchemaDefinition> {
	/** Carries immutable request identity and revocable hook capabilities. */
	readonly context: HookContext
	/** Identifies the business operation independently from internal cardinality. */
	readonly kind: 'create'
	/** Contains the complete normalized candidate as an immutable schema draft. */
	readonly item: SchemaPreparedDraft<TSchema>
	/** Exposes the complete Core-owned graph only during a nested write. */
	readonly nestedWrite?: NestedWriteGraph
}

type SchemaBeforeMutationItemsForKind<
	TSchema extends SchemaDefinition,
	TKind extends SchemaBeforeOperationHookKind,
> = TKind extends SchemaCreateHookKind
	? SchemaCreateItemPair<TSchema>
	: TKind extends SchemaUpdateHookKind
		? SchemaUpdateItemPair<TSchema>
		: TKind extends SchemaDeleteHookKind
			? SchemaDeleteItemPair<TSchema>
			: never

type SchemaAfterMutationItemsForKind<
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationHookKind,
> = TKind extends SchemaCreateHookKind
	? SchemaMutationItemPair<TSchema, null, SchemaResult<TSchema>>
	: TKind extends SchemaUpdateHookKind
		? SchemaMutationItemPair<
				TSchema,
				SchemaResult<TSchema>,
				SchemaResult<TSchema>
			>
		: TKind extends SchemaUpsertHookKind
			? SchemaMutationItemPair<
					TSchema,
					SchemaResult<TSchema> | null,
					SchemaResult<TSchema>
				>
			: TKind extends SchemaDeleteHookKind
				? SchemaDeleteItemPair<TSchema>
				: never

/** Adds complete prepared values only where Runtime can know them before writing. */
export type SchemaBeforeMutationHookInput<
	TSchema extends SchemaDefinition,
	TOperation extends SchemaHookOperation<
		TSchema,
		SchemaBeforeOperationHookKind,
		QueryFieldName<TSchema>,
		unknown
	>,
> = TOperation extends OperationAstNode
	? TOperation['kind'] extends 'create-one'
		? SchemaBeforeCreateHookInput<TSchema>
		: TOperation['kind'] extends SchemaBeforeOperationHookKind
			? SchemaOperationHookInput<TOperation> &
					SchemaBeforeMutationItemsForKind<TSchema, TOperation['kind']>
			: never
	: never

/** Adds selection-independent materializations to one completed mutation. */
export type SchemaAfterMutationHookInput<
	TSchema extends SchemaDefinition,
	TOperation extends SchemaHookOperation<
		TSchema,
		SchemaMutationHookKind,
		QueryFieldName<TSchema>,
		unknown
	>,
> = TOperation extends OperationAstNode
	? SchemaOperationHookInput<TOperation> &
			SchemaAfterMutationItemsForKind<TSchema, TOperation['kind']>
	: never

/** Transforms one directed mutation after its visible preimage is stable. */
export type SchemaResolveHook<
	TSchema extends SchemaDefinition,
	TKind extends 'create-one' | 'update-one' | 'upsert-one',
> = <
	const TSelectedField extends QueryFieldName<TSchema>,
	const TIncludedPointer = never,
>(
	input: SchemaResolveInputHookInput<
		TSchema,
		SchemaHookOperation<TSchema, TKind, TSelectedField, TIncludedPointer>
	>,
) => MaybePromise<
	| SchemaHookOperation<TSchema, TKind, TSelectedField, TIncludedPointer>
	| undefined
>

/**
 * Observes or rejects one mutation after its reliable preimage is prepared.
 *
 * Returning a value has no effect. Mutation transformations belong to
 * `resolveInput`, after Access has approved and prepared the stable target.
 */
export type SchemaBeforeMutationHook<
	TSchema extends SchemaDefinition,
	TKind extends Exclude<SchemaBeforeOperationHookKind, 'create-one'>,
> = <
	const TSelectedField extends QueryFieldName<TSchema>,
	const TIncludedPointer = never,
>(
	input: SchemaBeforeMutationHookInput<
		TSchema,
		SchemaHookOperation<TSchema, TKind, TSelectedField, TIncludedPointer>
	>,
) => MaybePromise<void>

/** Observes or rejects one persisted mutation before the transaction commits. */
export type SchemaAfterHook<
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationHookKind,
> = <
	const TSelectedField extends QueryFieldName<TSchema>,
	const TIncludedPointer = never,
>(
	input: SchemaAfterMutationHookInput<
		TSchema,
		SchemaHookOperation<TSchema, TKind, TSelectedField, TIncludedPointer>
	>,
) => MaybePromise<void>

/** Resolves normalized create and update values before business validation. */
export type SchemaResolveInputHook<TSchema extends SchemaDefinition> =
	SchemaResolveHook<TSchema, 'create-one' | 'update-one' | 'upsert-one'>

/** Runs before one itemized create operation. */
export type SchemaBeforeCreateHook<TSchema extends SchemaDefinition> = (
	input: SchemaBeforeCreateHookInput<TSchema>,
) => MaybePromise<void>

/** Runs after one itemized create operation. */
export type SchemaAfterCreateHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, 'create-one'>

/** Runs before one itemized update operation. */
export type SchemaBeforeUpdateHook<TSchema extends SchemaDefinition> =
	SchemaBeforeMutationHook<TSchema, 'update-one'>

/** Runs after one itemized update operation. */
export type SchemaAfterUpdateHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, 'update-one'>

/** Runs after one itemized upsert operation. */
export type SchemaAfterUpsertHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, 'upsert-one'>

/** Runs before one itemized delete operation. */
export type SchemaBeforeDeleteHook<TSchema extends SchemaDefinition> =
	SchemaBeforeMutationHook<TSchema, 'delete-one'>

/** Runs after one itemized delete operation. */
export type SchemaAfterDeleteHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, 'delete-one'>

/** Declares input resolution directly, as a list, or by save family. */
export type SchemaResolveInputHookDeclaration<
	TSchema extends SchemaDefinition,
> =
	| HookHandlerDeclaration<SchemaResolveInputHook<TSchema>>
	| SaveHookFamily<
			SchemaResolveInputHook<TSchema>,
			SchemaResolveHook<TSchema, 'create-one'>,
			SchemaResolveHook<TSchema, 'update-one'>,
			SchemaResolveHook<TSchema, 'upsert-one'>
	  >

/**
 * Declares schema-owned business behavior without requiring a plugin.
 *
 * Operation groups expose concise create, update, upsert, and delete branches.
 * Every branch accepts one handler or a non-empty ordered handler list.
 */
export interface SchemaHooks<TSchema extends SchemaDefinition> {
	/**
	 * Transforms normalized create, update, or upsert values before validation.
	 *
	 * @example `resolveInput: ({ operation }) => operation`
	 */
	readonly resolveInput?: SchemaResolveInputHookDeclaration<TSchema>
	/**
	 * Observes prepared mutation items without transforming the operation.
	 * @example `beforeOperation: { update: ({ originalItem, item }) => audit(originalItem, item) }`
	 */
	readonly beforeOperation?: SchemaBeforeOperationHooks<TSchema>
	/**
	 * Observes persisted mutation items without transforming the result.
	 * @example `afterOperation: { create: ({ item }) => audit(item) }`
	 */
	readonly afterOperation?: SchemaAfterOperationHooks<TSchema>
}
