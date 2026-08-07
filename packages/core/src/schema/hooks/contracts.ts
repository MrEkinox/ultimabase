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

/** Groups every read terminal without introducing a second query model. */
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

interface OperationHookFamilyOptions<
	TAll,
	TCreate,
	TUpdate,
	TUpsert,
	TDelete,
	TRead,
> extends SaveHookFamilyOptions<TAll, TCreate, TUpdate, TUpsert> {
	/** Runs for every create, update, upsert, delete, and read operation. */
	readonly all?: HookHandlerDeclaration<TAll>
	/** Runs only for delete operations. */
	readonly delete?: HookHandlerDeclaration<TDelete>
	/** Runs only for read operations. */
	readonly read?: HookHandlerDeclaration<TRead>
}

/** Specializes an operation-wide handler by one non-empty logical family map. */
export type OperationHookFamily<
	TAll,
	TCreate,
	TUpdate,
	TUpsert,
	TDelete,
	TRead,
> = RequireAtLeastOne<
	OperationHookFamilyOptions<TAll, TCreate, TUpdate, TUpsert, TDelete, TRead>
>

interface MutationHookFamilyOptions<
	TAll,
	TCreate,
	TUpdate,
	TUpsert,
	TDelete,
> extends SaveHookFamilyOptions<TAll, TCreate, TUpdate, TUpsert> {
	/** Runs for every create, update, upsert, and delete operation. */
	readonly all?: HookHandlerDeclaration<TAll>
	/** Runs only for delete operations. */
	readonly delete?: HookHandlerDeclaration<TDelete>
}

/** Specializes a mutation-wide handler through one non-empty family map. */
export type MutationHookFamily<TAll, TCreate, TUpdate, TUpsert, TDelete> =
	RequireAtLeastOne<
		MutationHookFamilyOptions<TAll, TCreate, TUpdate, TUpsert, TDelete>
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

/** Couples one completed operation to the result retained for finalization hooks. */
export type SchemaOperationOutcome<TOperation extends OperationAstNode> =
	TOperation extends OperationAstNode
		? Readonly<{
				/** Carries immutable request identity and revocable hook capabilities. */
				context: HookContext
				/** The exact terminal discriminant used for result narrowing. */
				kind: TOperation['kind']
				/** The completed immutable operation. */
				operation: TOperation
				/** The exact result produced before transaction finalization. */
				result: SchemaHookResult<TOperation>
			}>
		: never

/** Uses the transport-neutral validation format for business hook failures. */
export type HookValidationIssueCode = `${string}.${string}`

/** Carries one immutable framework, plugin, or application hook issue. */
export interface HookValidationIssue {
	readonly code: HookValidationIssueCode
	readonly message: string
	readonly path: ValidationIssuePath
}

/** Gives schema validation callbacks the common hook issue contract. */
export type SchemaHookValidationIssue = HookValidationIssue

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
 * Transforms or observes one compatible result before transaction finalization.
 * Runtime rejects a sibling terminal's otherwise compatible result shape.
 */
export type SchemaAfterHook<
	TSchema extends SchemaDefinition,
	TKind extends OperationKind,
> = <
	const TSelectedField extends QueryFieldName<TSchema>,
	const TIncludedPointer = never,
>(
	input: SchemaResultHookInput<
		SchemaHookOperation<TSchema, TKind, TSelectedField, TIncludedPointer>
	>,
) => MaybePromise<
	| SchemaHookResult<
			SchemaHookOperation<TSchema, TKind, TSelectedField, TIncludedPointer>
	  >
	| undefined
>

/** Resolves normalized create and update values before business validation. */
export type SchemaResolveInputHook<TSchema extends SchemaDefinition> =
	SchemaBeforeHook<TSchema, SchemaSaveHookKind>

/** Reports immutable business validation issues for one compatible save family. */
export type SchemaValidateFamilyHook<
	TSchema extends SchemaDefinition,
	TKind extends SchemaSaveHookKind,
> = <const TSelectedField extends QueryFieldName<TSchema>>(
	input: SchemaOperationHookInput<
		SchemaHookOperation<TSchema, TKind, TSelectedField>
	>,
) => MaybePromise<readonly SchemaHookValidationIssue[] | undefined>

/** Reports immutable business validation issues without mutating a collector. */
export type SchemaValidateHook<TSchema extends SchemaDefinition> =
	SchemaValidateFamilyHook<TSchema, SchemaSaveHookKind>

/** Runs before one create operation while covering singular and bulk terminals. */
export type SchemaBeforeCreateHook<TSchema extends SchemaDefinition> =
	SchemaBeforeHook<TSchema, SchemaCreateHookKind>

/** Runs after one create operation while covering singular and bulk terminals. */
export type SchemaAfterCreateHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, SchemaCreateHookKind>

/** Runs before one update operation while covering singular and bulk terminals. */
export type SchemaBeforeUpdateHook<TSchema extends SchemaDefinition> =
	SchemaBeforeHook<TSchema, SchemaUpdateHookKind>

/** Runs after one update operation while covering singular and bulk terminals. */
export type SchemaAfterUpdateHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, SchemaUpdateHookKind>

/** Runs before one upsert operation while covering singular and bulk terminals. */
export type SchemaBeforeUpsertHook<TSchema extends SchemaDefinition> =
	SchemaBeforeHook<TSchema, SchemaUpsertHookKind>

/** Runs after one upsert operation while covering singular and bulk terminals. */
export type SchemaAfterUpsertHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, SchemaUpsertHookKind>

/** Runs before one delete operation while covering singular and bulk terminals. */
export type SchemaBeforeDeleteHook<TSchema extends SchemaDefinition> =
	SchemaBeforeHook<TSchema, SchemaDeleteHookKind>

/** Runs after one delete operation while covering singular and bulk terminals. */
export type SchemaAfterDeleteHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, SchemaDeleteHookKind>

/** Correlates one read operation with its immutable selected QueryBuilder. */
export type SchemaBeforeReadInput<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer = never,
> =
	SchemaHookOperation<
		TSchema,
		SchemaReadHookKind,
		TSelectedField,
		TIncludedPointer
	> extends infer TOperation extends OperationAstNode
		? TOperation extends OperationAstNode
			? Readonly<{
					/** Carries immutable request identity and revocable hook capabilities. */
					context: HookContext
					/** The exact read terminal discriminant. */
					kind: TOperation['kind']
					/** The immutable read operation associated with the query. */
					operation: TOperation
					/** The immutable query that may be narrowed without erasing selection. */
					query: QueryBuilder<TSchema, TSelectedField, TIncludedPointer>
				}>
			: never
		: never

/** Supplies an immutable QueryBuilder while preserving its accumulated selection. */
export type SchemaBeforeReadHook<TSchema extends SchemaDefinition> = <
	const TSelectedField extends QueryFieldName<TSchema>,
	const TIncludedPointer = never,
>(
	input: SchemaBeforeReadInput<TSchema, TSelectedField, TIncludedPointer>,
) => MaybePromise<
	QueryBuilder<TSchema, TSelectedField, TIncludedPointer> | undefined
>

/** Observes or replaces a read result while retaining terminal correlation. */
export type SchemaAfterReadHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, SchemaReadHookKind>

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

/** Observes one successful mutation family after its outer commit succeeds. */
export type SchemaAfterCommitFamilyHook<
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationHookKind,
> = <const TSelectedField extends QueryFieldName<TSchema>>(
	input: SchemaOperationOutcome<
		SchemaHookOperation<TSchema, TKind, TSelectedField>
	>,
) => MaybePromise<void>

/** Observes one successful mutation only after its outer commit succeeds. */
export type SchemaAfterCommitHook<TSchema extends SchemaDefinition> =
	SchemaAfterCommitFamilyHook<TSchema, SchemaMutationHookKind>

/** Describes the schema mutations discarded by one confirmed rollback. */
export interface SchemaAfterRollbackInput<TSchema extends SchemaDefinition> {
	/** Carries immutable request identity and revocable hook capabilities. */
	readonly context: HookContext
	/** The original failure retained as an unknown boundary value. */
	readonly error: unknown
	/** Every discarded mutation for this schema in execution order. */
	readonly operations: readonly SchemaHookOperation<
		TSchema,
		SchemaMutationHookKind
	>[]
}

/** Observes a confirmed rollback without replacing the original failure. */
export type SchemaAfterRollbackHook<TSchema extends SchemaDefinition> = (
	input: SchemaAfterRollbackInput<TSchema>,
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

/** Describes one failed operation before or during transactional execution. */
export type SchemaErrorHookInput<
	TSchema extends SchemaDefinition,
	TKind extends OperationKind = OperationKind,
> =
	SchemaHookOperation<TSchema, TKind> extends infer TOperation extends
		OperationAstNode
		? TOperation extends OperationAstNode
			? Readonly<{
					/** Carries immutable request identity and revocable hook capabilities. */
					context: HookContext
					/** The original failure retained as an unknown boundary value. */
					error: unknown
					/** The exact terminal discriminant that failed. */
					kind: TOperation['kind']
					/** The immutable operation that failed. */
					operation: TOperation
					/** The stable lifecycle boundary where the original failure began. */
					phase: HookErrorPhase
					/** The final transaction and rollback outcome known to this observer. */
					transaction: HookErrorTransactionState
				}>
			: never
		: never

/** Observes an operation failure without replacing or hiding it. */
export type SchemaErrorHook<
	TSchema extends SchemaDefinition,
	TKind extends OperationKind = OperationKind,
> = (input: SchemaErrorHookInput<TSchema, TKind>) => MaybePromise<void>

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

/** Declares validation directly, as a list, or by save family. */
export type SchemaValidateHookDeclaration<TSchema extends SchemaDefinition> =
	| HookHandlerDeclaration<SchemaValidateHook<TSchema>>
	| SaveHookFamily<
			SchemaValidateHook<TSchema>,
			SchemaValidateFamilyHook<TSchema, SchemaCreateHookKind>,
			SchemaValidateFamilyHook<TSchema, SchemaUpdateHookKind>,
			SchemaValidateFamilyHook<TSchema, SchemaUpsertHookKind>
	  >

/** Declares one exact phase handler or a non-empty ordered handler list. */
type SchemaExactHookDeclaration<THandler> = HookHandlerDeclaration<THandler>

/** Declares post-commit effects directly, as a list, or by mutation family. */
export type SchemaAfterCommitHookDeclaration<TSchema extends SchemaDefinition> =
	| HookHandlerDeclaration<SchemaAfterCommitHook<TSchema>>
	| MutationHookFamily<
			SchemaAfterCommitHook<TSchema>,
			SchemaAfterCommitFamilyHook<TSchema, SchemaCreateHookKind>,
			SchemaAfterCommitFamilyHook<TSchema, SchemaUpdateHookKind>,
			SchemaAfterCommitFamilyHook<TSchema, SchemaUpsertHookKind>,
			SchemaAfterCommitFamilyHook<TSchema, SchemaDeleteHookKind>
	  >

/** Declares error observers directly, as a list, or by operation family. */
export type SchemaErrorHookDeclaration<TSchema extends SchemaDefinition> =
	| HookHandlerDeclaration<SchemaErrorHook<TSchema>>
	| OperationHookFamily<
			SchemaErrorHook<TSchema>,
			SchemaErrorHook<TSchema, SchemaCreateHookKind>,
			SchemaErrorHook<TSchema, SchemaUpdateHookKind>,
			SchemaErrorHook<TSchema, SchemaUpsertHookKind>,
			SchemaErrorHook<TSchema, SchemaDeleteHookKind>,
			SchemaErrorHook<TSchema, SchemaReadHookKind>
	  >

/**
 * Declares schema-owned business behavior without requiring a plugin.
 *
 * Every phase accepts one handler or a non-empty ordered handler list. Broad
 * phases additionally accept documented family maps without splitting one and
 * many terminals into duplicate declarations.
 */
export interface SchemaHooks<TSchema extends SchemaDefinition> {
	/**
	 * Transforms normalized create, update, or upsert values before validation.
	 *
	 * @example `resolveInput: ({ operation }) => operation`
	 */
	readonly resolveInput?: SchemaResolveInputHookDeclaration<TSchema>
	/**
	 * Returns structured business issues after input resolution.
	 *
	 * @example `validate: () => []`
	 */
	readonly validate?: SchemaValidateHookDeclaration<TSchema>
	/**
	 * Covers `createOne` and `createMany` before persistence.
	 * @example `beforeCreate: ({ operation }) => operation`
	 */
	readonly beforeCreate?: SchemaExactHookDeclaration<
		SchemaBeforeCreateHook<TSchema>
	>
	/**
	 * Covers `createOne` and `createMany` after persistence.
	 * @example `afterCreate: ({ result }) => result`
	 */
	readonly afterCreate?: SchemaExactHookDeclaration<
		SchemaAfterCreateHook<TSchema>
	>
	/**
	 * Covers `updateOne` and set-based `updateMany` before persistence.
	 * @example `beforeUpdate: ({ operation }) => operation`
	 */
	readonly beforeUpdate?: SchemaExactHookDeclaration<
		SchemaBeforeUpdateHook<TSchema>
	>
	/**
	 * Covers `updateOne` and set-based `updateMany` after persistence.
	 * @example `afterUpdate: ({ result }) => result`
	 */
	readonly afterUpdate?: SchemaExactHookDeclaration<
		SchemaAfterUpdateHook<TSchema>
	>
	/**
	 * Covers `upsertOne` and `upsertMany` before persistence.
	 * @example `beforeUpsert: ({ operation }) => operation`
	 */
	readonly beforeUpsert?: SchemaExactHookDeclaration<
		SchemaBeforeUpsertHook<TSchema>
	>
	/**
	 * Covers `upsertOne` and `upsertMany` after persistence.
	 * @example `afterUpsert: ({ result }) => result`
	 */
	readonly afterUpsert?: SchemaExactHookDeclaration<
		SchemaAfterUpsertHook<TSchema>
	>
	/**
	 * Covers `deleteOne` and set-based `deleteMany` before persistence.
	 * @example `beforeDelete: ({ operation }) => operation`
	 */
	readonly beforeDelete?: SchemaExactHookDeclaration<
		SchemaBeforeDeleteHook<TSchema>
	>
	/**
	 * Covers `deleteOne` and set-based `deleteMany` after persistence.
	 * @example `afterDelete: ({ result }) => result`
	 */
	readonly afterDelete?: SchemaExactHookDeclaration<
		SchemaAfterDeleteHook<TSchema>
	>
	/**
	 * Transforms every read QueryBuilder while preserving selected-field inference.
	 *
	 * @example `beforeRead: ({ query }) => query.limit(100)`
	 */
	readonly beforeRead?: SchemaExactHookDeclaration<
		SchemaBeforeReadHook<TSchema>
	>
	/**
	 * Covers `find`, `first`, `get`, `count`, and `exists` results.
	 * @example `afterRead: ({ result }) => result`
	 */
	readonly afterRead?: SchemaExactHookDeclaration<SchemaAfterReadHook<TSchema>>
	/**
	 * Runs once before the outer transaction commits and may still abort it.
	 * @example `beforeCommit: ({ changes }) => audit(changes)`
	 */
	readonly beforeCommit?: SchemaExactHookDeclaration<
		SchemaBeforeCommitHook<TSchema>
	>
	/**
	 * Runs only after the outer transaction commits successfully.
	 * @example `afterCommit: ({ result }) => publish(result)`
	 */
	readonly afterCommit?: SchemaAfterCommitHookDeclaration<TSchema>
	/**
	 * Runs only after the adapter confirms an outer rollback.
	 * @example `afterRollback: ({ error }) => report(error)`
	 */
	readonly afterRollback?: SchemaExactHookDeclaration<
		SchemaAfterRollbackHook<TSchema>
	>
	/**
	 * Observes a failure without replacing or suppressing the original error.
	 * @example `onError: ({ error }) => report(error)`
	 */
	readonly onError?: SchemaErrorHookDeclaration<TSchema>
}
