import type { MaybePromise } from '@ultimabase/shared'

import type {
	InferOperationResult,
	OperationAst,
	OperationAstNode,
	OperationKind,
	Query,
	QueryFieldName,
	QueryFilterNode,
	UpdateExpression,
} from '../../query/index.js'
import type {
	InferCreateInput,
	InferObject,
	InferUpdateInput,
} from '../inference/types.js'
import type {
	AnyValidationIssueCode,
	ValidationIssue,
} from '../plans/contracts.js'
import type { SchemaDefinition } from '../schema/definition.js'

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
export type SchemaFindHookKind = 'count' | 'exists' | 'find' | 'first' | 'get'

/** Groups every terminal whose business work participates in a transaction. */
export type SchemaMutationHookKind = SchemaDeleteHookKind | SchemaSaveHookKind

/**
 * Retains one schema's exact normalized operation while hiding internal Runtime types.
 *
 * `TSelectedField` remains generic because selection is known only when a query runs.
 */
export type SchemaHookOperation<
	TSchema extends SchemaDefinition,
	TKind extends OperationKind = OperationKind,
	TSelectedField extends QueryFieldName<TSchema> = QueryFieldName<TSchema>,
> = Extract<
	OperationAst<
		TSchema,
		UpdateExpression<TSchema>,
		QueryFilterNode<TSchema>,
		TSelectedField
	>,
	{ readonly kind: TKind }
>

/** Infers the exact public result produced by one hook operation. */
export type SchemaHookResult<TOperation extends OperationAstNode> =
	InferOperationResult<TOperation>

/** Provides compact aliases for the schema values most hooks consume. */
export interface SchemaHookTypes<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = QueryFieldName<TSchema>,
	TOperation extends SchemaHookOperation<
		TSchema,
		OperationKind,
		TSelectedField
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
	/** The immutable Query retaining the current selected-field union. */
	readonly query: Query<TSchema, TSelectedField>
	/** The public result correlated with the current operation. */
	readonly result: SchemaHookResult<TOperation>
}

/** Describes one operation before its adapter result exists. */
export type SchemaOperationHookInput<TOperation extends OperationAstNode> =
	TOperation extends OperationAstNode
		? Readonly<{
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
				/** The exact terminal discriminant used for result narrowing. */
				kind: TOperation['kind']
				/** The completed immutable operation. */
				operation: TOperation
				/** The exact result produced before transaction finalization. */
				result: SchemaHookResult<TOperation>
			}>
		: never

/** Uses the transport-neutral validation format for business hook failures. */
export type SchemaHookValidationIssue = ValidationIssue<AnyValidationIssueCode>

/**
 * Transforms or observes one compatible operation without relying on mutation.
 * Runtime validates that a replacement retains the exact incoming terminal.
 */
export type SchemaBeforeHook<
	TSchema extends SchemaDefinition,
	TKind extends OperationKind,
> = <const TSelectedField extends QueryFieldName<TSchema>>(
	input: SchemaOperationHookInput<
		SchemaHookOperation<TSchema, TKind, TSelectedField>
	>,
) => MaybePromise<
	SchemaHookOperation<TSchema, TKind, TSelectedField> | undefined
>

/**
 * Transforms or observes one compatible result before transaction finalization.
 * Runtime rejects a sibling terminal's otherwise compatible result shape.
 */
export type SchemaAfterHook<
	TSchema extends SchemaDefinition,
	TKind extends OperationKind,
> = <const TSelectedField extends QueryFieldName<TSchema>>(
	input: SchemaResultHookInput<
		SchemaHookOperation<TSchema, TKind, TSelectedField>
	>,
) => MaybePromise<
	| SchemaHookResult<SchemaHookOperation<TSchema, TKind, TSelectedField>>
	| undefined
>

/** Resolves normalized create and update values before business validation. */
export type SchemaResolveInputHook<TSchema extends SchemaDefinition> =
	SchemaBeforeHook<TSchema, SchemaSaveHookKind>

/** Reports immutable business validation issues without mutating a collector. */
export type SchemaValidateHook<TSchema extends SchemaDefinition> = <
	const TSelectedField extends QueryFieldName<TSchema>,
>(
	input: SchemaOperationHookInput<
		SchemaHookOperation<TSchema, SchemaSaveHookKind, TSelectedField>
	>,
) => MaybePromise<readonly SchemaHookValidationIssue[] | undefined>

/** Runs before any terminal-specific business phase. */
export type SchemaBeforeOperationHook<TSchema extends SchemaDefinition> =
	SchemaBeforeHook<TSchema, OperationKind>

/** Runs after any terminal-specific business phase and may replace its result. */
export type SchemaAfterOperationHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, OperationKind>

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

/** Runs before create, update, and upsert through one reusable handler. */
export type SchemaBeforeSaveHook<TSchema extends SchemaDefinition> =
	SchemaBeforeHook<TSchema, SchemaSaveHookKind>

/** Runs after create, update, and upsert through one reusable handler. */
export type SchemaAfterSaveHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, SchemaSaveHookKind>

/** Correlates one read operation with its immutable selected Query. */
export type SchemaBeforeFindInput<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
> =
	SchemaHookOperation<
		TSchema,
		SchemaFindHookKind,
		TSelectedField
	> extends infer TOperation extends OperationAstNode
		? TOperation extends OperationAstNode
			? Readonly<{
					/** The exact read terminal discriminant. */
					kind: TOperation['kind']
					/** The immutable read operation associated with the query. */
					operation: TOperation
					/** The immutable query that may be narrowed without erasing selection. */
					query: Query<TSchema, TSelectedField>
				}>
			: never
		: never

/** Supplies an immutable Query while preserving its accumulated selection. */
export type SchemaBeforeFindHook<TSchema extends SchemaDefinition> = <
	const TSelectedField extends QueryFieldName<TSchema>,
>(
	input: SchemaBeforeFindInput<TSchema, TSelectedField>,
) => MaybePromise<Query<TSchema, TSelectedField> | undefined>

/** Observes or replaces a read result while retaining terminal correlation. */
export type SchemaAfterFindHook<TSchema extends SchemaDefinition> =
	SchemaAfterHook<TSchema, SchemaFindHookKind>

/** Supplies all successful schema mutations before the outer commit. */
export type SchemaBeforeCommitResult<TSchema extends SchemaDefinition> =
	| Readonly<Partial<InferObject<TSchema>>>
	| readonly Readonly<Partial<InferObject<TSchema>>>[]
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
	/** Every mutation outcome buffered for this schema in execution order. */
	readonly changes: readonly SchemaBeforeCommitChange<TSchema>[]
}

/** May still abort the outer transaction before persistence is finalized. */
export type SchemaBeforeCommitHook<TSchema extends SchemaDefinition> = (
	input: SchemaBeforeCommitInput<TSchema>,
) => MaybePromise<void>

/** Observes one successful mutation only after its outer commit succeeds. */
export type SchemaAfterCommitHook<TSchema extends SchemaDefinition> = <
	const TSelectedField extends QueryFieldName<TSchema>,
>(
	input: SchemaOperationOutcome<
		SchemaHookOperation<TSchema, SchemaMutationHookKind, TSelectedField>
	>,
) => MaybePromise<void>

/** Describes the schema mutations discarded by one confirmed rollback. */
export interface SchemaAfterRollbackInput<TSchema extends SchemaDefinition> {
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

/** Describes one failed operation before or during transactional execution. */
export type SchemaErrorHookInput<TSchema extends SchemaDefinition> =
	SchemaHookOperation<TSchema> extends infer TOperation extends OperationAstNode
		? TOperation extends OperationAstNode
			? Readonly<{
					/** The original failure retained as an unknown boundary value. */
					error: unknown
					/** The exact terminal discriminant that failed. */
					kind: TOperation['kind']
					/** The immutable operation that failed. */
					operation: TOperation
				}>
			: never
		: never

/** Observes an operation failure without replacing or hiding it. */
export type SchemaErrorHook<TSchema extends SchemaDefinition> = (
	input: SchemaErrorHookInput<TSchema>,
) => MaybePromise<void>

/**
 * Declares schema-owned business behavior without requiring a plugin.
 *
 * Every property accepts one handler in issue 325. Ordered lists and family
 * maps are added by issue 327 without changing these handler contracts.
 */
export interface SchemaHooks<TSchema extends SchemaDefinition> {
	/**
	 * Transforms normalized create, update, or upsert values before validation.
	 *
	 * @example `resolveInput: ({ operation }) => operation`
	 */
	readonly resolveInput?: SchemaResolveInputHook<TSchema>
	/**
	 * Returns structured business issues after input resolution.
	 *
	 * @example `validate: () => []`
	 */
	readonly validate?: SchemaValidateHook<TSchema>
	/**
	 * Runs before every terminal operation and may return a replacement operation.
	 *
	 * @example `beforeOperation: ({ operation }) => operation`
	 */
	readonly beforeOperation?: SchemaBeforeOperationHook<TSchema>
	/**
	 * Runs after every terminal operation and may return a replacement result.
	 *
	 * @example `afterOperation: ({ result }) => result`
	 */
	readonly afterOperation?: SchemaAfterOperationHook<TSchema>
	/**
	 * Covers `createOne` and `createMany` before persistence.
	 * @example `beforeCreate: ({ operation }) => operation`
	 */
	readonly beforeCreate?: SchemaBeforeCreateHook<TSchema>
	/**
	 * Covers `createOne` and `createMany` after persistence.
	 * @example `afterCreate: ({ result }) => result`
	 */
	readonly afterCreate?: SchemaAfterCreateHook<TSchema>
	/**
	 * Covers `updateOne` and set-based `updateMany` before persistence.
	 * @example `beforeUpdate: ({ operation }) => operation`
	 */
	readonly beforeUpdate?: SchemaBeforeUpdateHook<TSchema>
	/**
	 * Covers `updateOne` and set-based `updateMany` after persistence.
	 * @example `afterUpdate: ({ result }) => result`
	 */
	readonly afterUpdate?: SchemaAfterUpdateHook<TSchema>
	/**
	 * Covers `upsertOne` and `upsertMany` before persistence.
	 * @example `beforeUpsert: ({ operation }) => operation`
	 */
	readonly beforeUpsert?: SchemaBeforeUpsertHook<TSchema>
	/**
	 * Covers `upsertOne` and `upsertMany` after persistence.
	 * @example `afterUpsert: ({ result }) => result`
	 */
	readonly afterUpsert?: SchemaAfterUpsertHook<TSchema>
	/**
	 * Covers `deleteOne` and set-based `deleteMany` before persistence.
	 * @example `beforeDelete: ({ operation }) => operation`
	 */
	readonly beforeDelete?: SchemaBeforeDeleteHook<TSchema>
	/**
	 * Covers `deleteOne` and set-based `deleteMany` after persistence.
	 * @example `afterDelete: ({ result }) => result`
	 */
	readonly afterDelete?: SchemaAfterDeleteHook<TSchema>
	/**
	 * Covers create, update, and upsert before their exact CRUD phase.
	 * @example `beforeSave: ({ operation }) => operation`
	 */
	readonly beforeSave?: SchemaBeforeSaveHook<TSchema>
	/**
	 * Covers create, update, and upsert after their exact CRUD phase.
	 * @example `afterSave: ({ result }) => result`
	 */
	readonly afterSave?: SchemaAfterSaveHook<TSchema>
	/**
	 * Transforms every read Query while preserving selected-field inference.
	 *
	 * @example `beforeFind: ({ query }) => query.limit(100)`
	 */
	readonly beforeFind?: SchemaBeforeFindHook<TSchema>
	/**
	 * Covers `find`, `first`, `get`, `count`, and `exists` results.
	 * @example `afterFind: ({ result }) => result`
	 */
	readonly afterFind?: SchemaAfterFindHook<TSchema>
	/**
	 * Runs once before the outer transaction commits and may still abort it.
	 * @example `beforeCommit: ({ changes }) => audit(changes)`
	 */
	readonly beforeCommit?: SchemaBeforeCommitHook<TSchema>
	/**
	 * Runs only after the outer transaction commits successfully.
	 * @example `afterCommit: ({ result }) => publish(result)`
	 */
	readonly afterCommit?: SchemaAfterCommitHook<TSchema>
	/**
	 * Runs only after the adapter confirms an outer rollback.
	 * @example `afterRollback: ({ error }) => report(error)`
	 */
	readonly afterRollback?: SchemaAfterRollbackHook<TSchema>
	/**
	 * Observes a failure without replacing or suppressing the original error.
	 * @example `onError: ({ error }) => report(error)`
	 */
	readonly onError?: SchemaErrorHook<TSchema>
}
