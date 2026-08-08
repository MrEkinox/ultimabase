import type { MaybePromise } from '@ultimabase/shared'

import type {
	InferOperationRecordResult,
	NonAtomicBulkResult,
	OperationAst,
	OperationAstNode,
	OperationIncludedField,
	OperationKind,
	QueryBuilder,
	QueryFieldName,
	QueryFilterNode,
	UpdateExpression,
} from '../../query/index.js'
import type {
	InferCreateInput,
	InferObject,
	InferUpdateInput,
} from '../inference/types.js'
import type { ValidationIssuePath } from '../plans/contracts.js'
import type { SchemaDefinition } from '../schema/definition.js'
import type { RelationUpdateExpression } from '../relations/mutation.js'
import type { HookContext } from './hook-context.js'

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

/** Groups every read terminal for shared Access and operation typing. */
export type SchemaReadHookKind =
	'count' | 'exists' | 'find-many' | 'find-one' | 'get'

/** Groups every terminal whose business work participates in a transaction. */
export type SchemaMutationHookKind = SchemaDeleteHookKind | SchemaSaveHookKind

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
		boolean,
		TIncludedPointer
	>,
	{ readonly kind: TKind }
>

/** Infers the exact public result produced by one hook operation. */
export type SchemaHookResult<TOperation extends OperationAstNode> =
	InferOperationRecordResult<TOperation>

/** Provides compact aliases for the schema values most hooks consume. */
export interface SchemaHookTypes<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = QueryFieldName<TSchema>,
	TOperation extends SchemaHookOperation<
		TSchema,
		OperationKind,
		TSelectedField,
		unknown
	> = SchemaHookOperation<TSchema, OperationKind, TSelectedField>,
> {
	/** The complete developer input accepted by create operations. */
	readonly create: InferCreateInput<TSchema>
	/** The partial developer input accepted by update operations. */
	readonly update: InferUpdateInput<TSchema>
	/** The complete immutable object returned after persistence. */
	readonly object: InferObject<TSchema>
	/** Every normalized terminal operation supported by the schema. */
	readonly operation: TOperation
	/** The immutable QueryBuilder retaining the current selected-field union. */
	readonly query: QueryBuilder<
		TSchema,
		TSelectedField,
		OperationIncludedField<TOperation>
	>
	/** The public result correlated with the current operation. */
	readonly result: SchemaHookResult<TOperation>
}

/** Describes one operation before its adapter result exists. */
export type SchemaOperationHookInput<TOperation extends OperationAstNode> =
	TOperation extends OperationAstNode
		? Readonly<{
				/** Carries immutable request identity and revocable hook capabilities. */
				context: HookContext
				/** The exact terminal discriminant used for concise narrowing. */
				kind: TOperation['kind']
				/** The immutable normalized operation being processed. */
				operation: TOperation
			}>
		: never

/** Keeps each operation correlated with its exact public result. */
export type SchemaResultHookInput<TOperation extends OperationAstNode> =
	TOperation extends OperationAstNode
		? Readonly<{
				/** Carries immutable request identity and revocable hook capabilities. */
				context: HookContext
				/** The exact terminal discriminant used for concise narrowing. */
				kind: TOperation['kind']
				/** The immutable normalized operation that produced the result. */
				operation: TOperation
				/** The exact result for this operation and its selected fields. */
				result: SchemaHookResult<TOperation>
			}>
		: never

/** Correlates one complete logical object across a materialized mutation. */
export interface SchemaMutationItemPair<
	TSchema extends SchemaDefinition,
	TOriginalItem extends Readonly<InferObject<TSchema>> | null = Readonly<
		InferObject<TSchema>
	> | null,
	TItem extends Readonly<InferObject<TSchema>> | null = Readonly<
		InferObject<TSchema>
	> | null,
> {
	/** Contains the object visible before persistence, or `null` for creation. */
	readonly originalItem: TOriginalItem
	/** Contains the candidate or persisted object, or `null` for deletion. */
	readonly item: TItem
}

type SchemaCreateItemPair<TSchema extends SchemaDefinition> =
	SchemaMutationItemPair<TSchema, null, Readonly<InferObject<TSchema>>>

type SchemaUpdateItemPair<TSchema extends SchemaDefinition> =
	SchemaMutationItemPair<
		TSchema,
		Readonly<InferObject<TSchema>>,
		Readonly<InferObject<TSchema>>
	>

type SchemaUpsertItemPair<TSchema extends SchemaDefinition> =
	SchemaMutationItemPair<
		TSchema,
		Readonly<InferObject<TSchema>> | null,
		Readonly<InferObject<TSchema>>
	>

type SchemaDeleteItemPair<TSchema extends SchemaDefinition> =
	SchemaMutationItemPair<TSchema, Readonly<InferObject<TSchema>>, null>

type SchemaBeforeMutationItemsForKind<
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationHookKind,
> = TKind extends 'create-one'
	? SchemaCreateItemPair<TSchema>
	: TKind extends 'update-one'
		? SchemaUpdateItemPair<TSchema>
		: TKind extends 'delete-one'
			? SchemaDeleteItemPair<TSchema>
			: TKind extends 'create-many'
				? Readonly<{
						readonly items: readonly SchemaCreateItemPair<TSchema>[]
					}>
				: object

type SchemaAfterMutationItemsForKind<
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationHookKind,
> = TKind extends 'create-one'
	? SchemaCreateItemPair<TSchema>
	: TKind extends 'update-one'
		? SchemaUpdateItemPair<TSchema>
		: TKind extends 'upsert-one'
			? SchemaUpsertItemPair<TSchema>
			: TKind extends 'delete-one'
				? SchemaDeleteItemPair<TSchema>
				: TKind extends 'create-many'
					? Readonly<{
							readonly items: readonly SchemaCreateItemPair<TSchema>[]
						}>
					: TKind extends 'update-many'
						? Readonly<{
								readonly items: readonly SchemaUpdateItemPair<TSchema>[]
							}>
						: TKind extends 'delete-many'
							? Readonly<{
									readonly items: readonly SchemaDeleteItemPair<TSchema>[]
								}>
							: Readonly<{
									readonly items: readonly SchemaUpsertItemPair<TSchema>[]
								}>

/** Adds complete prepared values only where Runtime can know them before writing. */
export type SchemaBeforeMutationHookInput<
	TSchema extends SchemaDefinition,
	TOperation extends SchemaHookOperation<
		TSchema,
		SchemaMutationHookKind,
		QueryFieldName<TSchema>,
		unknown
	>,
> = TOperation extends OperationAstNode
	? SchemaOperationHookInput<TOperation> &
			SchemaBeforeMutationItemsForKind<TSchema, TOperation['kind']>
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
	? SchemaResultHookInput<TOperation> &
			SchemaAfterMutationItemsForKind<TSchema, TOperation['kind']>
	: never

type SchemaBeforeMutationInputForKind<
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationHookKind,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
> = TKind extends SchemaMutationHookKind
	? SchemaBeforeMutationHookInput<
			TSchema,
			SchemaHookOperation<TSchema, TKind, TSelectedField, TIncludedPointer>
		>
	: never

/** Uses the transport-neutral validation format for business hook failures. */
export type HookValidationIssueCode = `${string}.${string}`

/** Carries one immutable framework, plugin, or application hook issue. */
export interface HookValidationIssue {
	readonly code: HookValidationIssueCode
	readonly message: string
	readonly path: ValidationIssuePath
}

/**
 * Transforms or observes one compatible operation without relying on mutation.
 * Runtime validates that a replacement retains the exact incoming terminal.
 */
export type SchemaBeforeHook<
	TSchema extends SchemaDefinition,
	TKind extends OperationKind,
> = <
	const TSelectedField extends QueryFieldName<TSchema>,
	const TIncludedPointer = never,
>(
	input: SchemaOperationHookInput<
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
 * `resolveInput`, before the adapter prepares and locks the target.
 * Atomic upserts intentionally expose only their normalized branch inputs here.
 */
export type SchemaBeforeMutationHook<
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationHookKind,
> = <
	const TSelectedField extends QueryFieldName<TSchema>,
	const TIncludedPointer = never,
>(
	input: SchemaBeforeMutationInputForKind<
		TSchema,
		TKind,
		TSelectedField,
		TIncludedPointer
	>,
) => MaybePromise<void>

/**
 * Observes or rejects one compatible result before transaction finalization.
 * Returning a value has no effect; persisted results remain framework-owned.
 */
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
	SchemaBeforeHook<TSchema, SchemaSaveHookKind>

/** Runs before one create operation while covering singular and bulk terminals. */
export type SchemaBeforeCreateHook<TSchema extends SchemaDefinition> =
	SchemaBeforeMutationHook<TSchema, SchemaCreateHookKind>

/** Runs after one create operation while covering singular and bulk terminals. */
export type SchemaAfterCreateHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, SchemaCreateHookKind>

/** Runs before one update operation while covering singular and bulk terminals. */
export type SchemaBeforeUpdateHook<TSchema extends SchemaDefinition> =
	SchemaBeforeMutationHook<TSchema, SchemaUpdateHookKind>

/** Runs after one update operation while covering singular and bulk terminals. */
export type SchemaAfterUpdateHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, SchemaUpdateHookKind>

/** Runs before one upsert operation while covering singular and bulk terminals. */
export type SchemaBeforeUpsertHook<TSchema extends SchemaDefinition> =
	SchemaBeforeMutationHook<TSchema, SchemaUpsertHookKind>

/** Runs after one upsert operation while covering singular and bulk terminals. */
export type SchemaAfterUpsertHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, SchemaUpsertHookKind>

/** Runs before one delete operation while covering singular and bulk terminals. */
export type SchemaBeforeDeleteHook<TSchema extends SchemaDefinition> =
	SchemaBeforeMutationHook<TSchema, SchemaDeleteHookKind>

/** Runs after one delete operation while covering singular and bulk terminals. */
export type SchemaAfterDeleteHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, SchemaDeleteHookKind>

/** Supplies all successful schema mutations before the outer commit. */
export type SchemaBeforeCommitResult<TSchema extends SchemaDefinition> =
	| Readonly<Partial<InferObject<TSchema>>>
	| readonly Readonly<Partial<InferObject<TSchema>>>[]
	| NonAtomicBulkResult<Readonly<Partial<InferObject<TSchema>>>>
	| number
	| null

/** Keeps heterogeneous transaction changes honest about selected fields. */
export type SchemaBeforeCommitChange<TSchema extends SchemaDefinition> =
	SchemaHookOperation<
		TSchema,
		SchemaMutationHookKind
	> extends infer TOperation extends OperationAstNode
		? TOperation extends OperationAstNode
			? Readonly<{
					/** The exact mutation discriminant. */
					kind: TOperation['kind']
					/** The completed immutable mutation. */
					operation: TOperation
					/** A result that never promises fields omitted by an earlier selection. */
					result: SchemaBeforeCommitResult<TSchema>
				}>
			: never
		: never

/** Supplies all successful schema mutations before the outer commit. */
export interface SchemaBeforeCommitInput<TSchema extends SchemaDefinition> {
	/** Carries immutable request identity and revocable hook capabilities. */
	readonly context: HookContext
	/** Every mutation outcome buffered for this schema in execution order. */
	readonly changes: readonly SchemaBeforeCommitChange<TSchema>[]
}

/** May still abort the outer transaction before persistence is finalized. */
export type SchemaBeforeCommitHook<TSchema extends SchemaDefinition> = (
	input: SchemaBeforeCommitInput<TSchema>,
) => MaybePromise<void>

/** Observes all successful schema mutations after the outer commit succeeds. */
export type SchemaAfterCommitHook<TSchema extends SchemaDefinition> = (
	input: SchemaBeforeCommitInput<TSchema>,
) => MaybePromise<void>

/** Identifies the stable public boundary at which an observed failure began. */
export type HookErrorPhase =
	| 'transaction-start'
	| 'operation'
	| 'before-commit'
	| 'commit'
	| 'rollback'
	| 'after-rollback'
	| 'after-commit'
	| 'post-commit'

/**
 * Describes the final transaction outcome known when an error hook runs.
 *
 * The discriminated union prevents consumers from observing impossible pairs,
 * such as a committed transaction that also reports a successful rollback.
 */
export type HookErrorTransactionState =
	| Readonly<{
			/** No adapter transaction existed for this operation failure. */
			status: 'not-started'
			/** Rollback cannot apply when no transaction was opened. */
			rollback: 'not-applicable'
	  }>
	| Readonly<{
			/** The adapter confirmed that the transaction was discarded. */
			status: 'rolled-back'
			/** Confirms that rollback completed successfully. */
			rollback: 'succeeded'
	  }>
	| Readonly<{
			/** The transaction failed and its adapter rollback also failed. */
			status: 'rollback-failed'
			/** Reports the failed rollback without implying that data was discarded. */
			rollback: 'failed'
	  }>
	| Readonly<{
			/** Persistence committed before a finalization observer failed. */
			status: 'committed'
			/** A committed transaction must never be reported as rolled back. */
			rollback: 'not-applicable'
	  }>

/** Declares input resolution directly, as a list, or by save family. */
export type SchemaResolveInputHookDeclaration<
	TSchema extends SchemaDefinition,
> =
	| HookHandlerDeclaration<SchemaResolveInputHook<TSchema>>
	| SaveHookFamily<
			SchemaResolveInputHook<TSchema>,
			SchemaBeforeHook<TSchema, SchemaCreateHookKind>,
			SchemaBeforeHook<TSchema, SchemaUpdateHookKind>,
			SchemaBeforeHook<TSchema, SchemaUpsertHookKind>
	  >

/** Declares one exact phase handler or a non-empty ordered handler list. */
type SchemaExactHookDeclaration<THandler> = HookHandlerDeclaration<THandler>

/** Groups mutation observers that run after reliable preparation and before persistence. */
export interface SchemaBeforeOperationHooks<TSchema extends SchemaDefinition> {
	/** Runs before create persistence after candidate materialization. */
	readonly create?: SchemaExactHookDeclaration<SchemaBeforeCreateHook<TSchema>>
	/** Runs before update persistence after target preparation. */
	readonly update?: SchemaExactHookDeclaration<SchemaBeforeUpdateHook<TSchema>>
	/** Runs before an atomic upsert without assuming its eventual branch. */
	readonly upsert?: SchemaExactHookDeclaration<SchemaBeforeUpsertHook<TSchema>>
	/** Runs before delete persistence after target preparation. */
	readonly delete?: SchemaExactHookDeclaration<SchemaBeforeDeleteHook<TSchema>>
}

/** Groups mutation observers that run after persistence and before commit. */
export interface SchemaAfterOperationHooks<TSchema extends SchemaDefinition> {
	/** Runs after a create result has been materialized. */
	readonly create?: SchemaExactHookDeclaration<SchemaAfterCreateHook<TSchema>>
	/** Runs after an update result has been materialized. */
	readonly update?: SchemaExactHookDeclaration<SchemaAfterUpdateHook<TSchema>>
	/** Runs after an upsert result has been materialized. */
	readonly upsert?: SchemaExactHookDeclaration<SchemaAfterUpsertHook<TSchema>>
	/** Runs after a delete result has been materialized. */
	readonly delete?: SchemaExactHookDeclaration<SchemaAfterDeleteHook<TSchema>>
}

/** Groups transaction-wide hooks without exposing rollback or error internals. */
export interface SchemaTransactionHooks<TSchema extends SchemaDefinition> {
	/** Runs once before commit and may abort the outer transaction. */
	readonly beforeCommit?: SchemaExactHookDeclaration<
		SchemaBeforeCommitHook<TSchema>
	>
	/** Runs once after commit for external side effects. */
	readonly afterCommit?: SchemaExactHookDeclaration<
		SchemaAfterCommitHook<TSchema>
	>
}

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
	/**
	 * Runs once per schema around the outer transaction commit.
	 * @example `transaction: { afterCommit: ({ changes }) => publish(changes) }`
	 */
	readonly transaction?: SchemaTransactionHooks<TSchema>
}
