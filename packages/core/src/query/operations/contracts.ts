import type {
	InferCreateInput,
	InferObject,
	SchemaDefinition,
} from '../../schema/index.js'

import type {
	QueryAst,
	QueryExpressionNode,
	QueryFieldName,
	QuerySchemaNode,
	QuerySelectionNode,
} from '../ast/contracts.js'
import type { QueryFilterNode } from '../filters/logical.js'
import type {
	UpdateExpression,
	UpdateExpressionNode,
} from '../updates/contracts.js'

/** Marks every terminal operation with one exhaustively matchable discriminant. */
export interface OperationAstNode {
	readonly kind: string
}

declare const operationSelectionType: unique symbol
declare const operationInclusionType: unique symbol

/** Reads the type-only inclusion projection without coupling it to runtime AST data. */
export type OperationIncludedPointer<TOperation extends OperationAstNode> =
	TOperation extends { readonly [operationInclusionType]?: unknown }
		? Exclude<TOperation[typeof operationInclusionType], undefined>
		: never

/** Carries the only execution behavior configurable by normalized bulk writes. */
export interface AtomicBulkOperationOptions<TAtomic extends boolean = boolean> {
	readonly atomic: TAtomic
}

/** Returns every value after a non-atomic collection completes successfully. */
export interface NonAtomicBulkCompleted<TResult> {
	readonly results: readonly TResult[]
	readonly status: 'completed'
}

/** Reports the successful prefix when persistence stops at the first failed item. */
export interface NonAtomicBulkStopped<TResult> {
	/** Retains the adapter persistence failure without weakening it to `Error`. */
	readonly error: unknown
	/** Identifies the first input that was not persisted. */
	readonly failedIndex: number
	/** Contains only the successful input prefix in stable order. */
	readonly results: readonly TResult[]
	readonly status: 'stopped'
}

/** Describes the explicit partial-success contract selected by `atomic: false`. */
export type NonAtomicBulkResult<TResult> =
	NonAtomicBulkCompleted<TResult> | NonAtomicBulkStopped<TResult>

/** Selects the public collection result from its normalized atomic literal. */
export type BulkOperationResult<
	TResult,
	TAtomic extends boolean,
> = TAtomic extends false ? NonAtomicBulkResult<TResult> : readonly TResult[]

/** Identifies the declared key an adapter must use for conflict detection. */
export interface UniqueUpsertTargetNode<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	readonly kind: 'unique-upsert-target'
	readonly fields: readonly [
		QueryFieldName<TSchema>,
		...QueryFieldName<TSchema>[],
	]
}

/** Infers the framework identifier type retained by the exact schema. */
export type OperationObjectId<TSchema extends SchemaDefinition> =
	InferObject<TSchema> extends { readonly id: infer TId } ? TId : string

type OperationQuery<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode,
> = QueryAst<TSchema, TFilter>

interface QueryOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
> extends OperationAstNode {
	readonly query: OperationQuery<TSchema, TFilter>
	// Selection stays type-only while the Query AST remains the runtime source of truth.
	readonly [operationSelectionType]?: TSelectedField
	// Included pointer projections stay type-only beside their runtime AST nodes.
	readonly [operationInclusionType]?: TIncludedPointer
}

interface SchemaOperationAst<
	TSchema extends SchemaDefinition,
> extends OperationAstNode {
	readonly schema: QuerySchemaNode<TSchema>
}

interface SelectedSchemaOperationAst<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
> extends SchemaOperationAst<TSchema> {
	readonly selection: QuerySelectionNode<QueryFieldName<TSchema>>
	// Selection stays type-only while the normalized node remains the runtime source of truth.
	readonly [operationSelectionType]?: TSelectedField
}

/** Reads every object selected by one query. */
export interface FindManyOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedPointer = never,
> extends QueryOperationAst<
	TSchema,
	TFilter,
	TSelectedField,
	TIncludedPointer
> {
	readonly kind: 'find-many'
}

/** Reads at most the first object selected by one query. */
export interface FindOneOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedPointer = never,
> extends QueryOperationAst<
	TSchema,
	TFilter,
	TSelectedField,
	TIncludedPointer
> {
	readonly kind: 'find-one'
}

/** Reads one identifier while preserving the query's selection and filters. */
export interface GetOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedPointer = never,
> extends QueryOperationAst<
	TSchema,
	TFilter,
	TSelectedField,
	TIncludedPointer
> {
	readonly kind: 'get'
	readonly id: OperationObjectId<TSchema>
}

/** Counts every object selected by one query without loading result objects. */
export interface CountOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
	TSelectedField extends QueryFieldName<TSchema> = never,
> extends QueryOperationAst<TSchema, TFilter, TSelectedField, never> {
	readonly kind: 'count'
}

/** Tests whether one query selects at least one object. */
export interface ExistsOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
	TSelectedField extends QueryFieldName<TSchema> = never,
> extends QueryOperationAst<TSchema, TFilter, TSelectedField, never> {
	readonly kind: 'exists'
}

/** Creates exactly one object from its schema-derived input shape. */
export interface CreateOneOperationAst<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
> extends SelectedSchemaOperationAst<TSchema, TSelectedField> {
	readonly kind: 'create-one'
	readonly input: InferCreateInput<TSchema>
}

/** Creates an ordered collection with explicit normalized atomic behavior. */
export interface CreateManyOperationAst<
	TSchema extends SchemaDefinition,
	TAtomic extends boolean = true,
	TSelectedField extends QueryFieldName<TSchema> = never,
> extends SelectedSchemaOperationAst<TSchema, TSelectedField> {
	readonly kind: 'create-many'
	readonly inputs: readonly InferCreateInput<TSchema>[]
	readonly options: AtomicBulkOperationOptions<TAtomic>
}

/** Applies one atomic update expression to at most one selected object. */
export interface UpdateOneOperationAst<
	TSchema extends SchemaDefinition,
	TUpdate extends UpdateExpressionNode = UpdateExpression<TSchema>,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedPointer = never,
> extends QueryOperationAst<
	TSchema,
	TFilter,
	TSelectedField,
	TIncludedPointer
> {
	readonly kind: 'update-one'
	readonly update: TUpdate
}

/** Applies one atomic update expression to every selected object. */
export interface UpdateManyOperationAst<
	TSchema extends SchemaDefinition,
	TUpdate extends UpdateExpressionNode = UpdateExpression<TSchema>,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
	TSelectedField extends QueryFieldName<TSchema> = never,
> extends QueryOperationAst<TSchema, TFilter, TSelectedField, never> {
	readonly kind: 'update-many'
	readonly update: TUpdate
}

/** Keeps the unique target, create input, and update expression independent. */
export interface UpsertOneOperationAst<
	TSchema extends SchemaDefinition,
	TUpdate extends UpdateExpressionNode = UpdateExpression<TSchema>,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedPointer = never,
> extends QueryOperationAst<
	TSchema,
	TFilter,
	TSelectedField,
	TIncludedPointer
> {
	readonly kind: 'upsert-one'
	readonly target: UniqueUpsertTargetNode<TSchema>
	readonly create: InferCreateInput<TSchema>
	readonly update: TUpdate
}

/** Represents one ordered item inside a bulk upsert operation. */
export interface UpsertOperationItem<
	TSchema extends SchemaDefinition,
	TUpdate extends UpdateExpressionNode = UpdateExpression<TSchema>,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> {
	readonly query: OperationQuery<TSchema, TFilter>
	readonly target: UniqueUpsertTargetNode<TSchema>
	readonly create: InferCreateInput<TSchema>
	readonly update: TUpdate
}

/** Upserts an ordered collection with explicit normalized atomic behavior. */
export interface UpsertManyOperationAst<
	TSchema extends SchemaDefinition,
	TUpdate extends UpdateExpressionNode = UpdateExpression<TSchema>,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
	TAtomic extends boolean = true,
	TSelectedField extends QueryFieldName<TSchema> = never,
> extends SelectedSchemaOperationAst<TSchema, TSelectedField> {
	readonly kind: 'upsert-many'
	readonly items: readonly UpsertOperationItem<TSchema, TUpdate, TFilter>[]
	readonly options: AtomicBulkOperationOptions<TAtomic>
}

/** Deletes at most one object selected by one query. */
export interface DeleteOneOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedPointer = never,
> extends QueryOperationAst<
	TSchema,
	TFilter,
	TSelectedField,
	TIncludedPointer
> {
	readonly kind: 'delete-one'
}

/** Deletes every object selected by one query and returns its selected preimage. */
export interface DeleteManyOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
	TSelectedField extends QueryFieldName<TSchema> = never,
> extends QueryOperationAst<TSchema, TFilter, TSelectedField, never> {
	readonly kind: 'delete-many'
}

/** Enumerates every terminal operation accepted by the single Runtime pipeline. */
export type OperationAst<
	TSchema extends SchemaDefinition,
	TUpdate extends UpdateExpressionNode = UpdateExpression<TSchema>,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TAtomic extends boolean = boolean,
	TIncludedPointer = never,
> =
	| FindManyOperationAst<TSchema, TFilter, TSelectedField, TIncludedPointer>
	| FindOneOperationAst<TSchema, TFilter, TSelectedField, TIncludedPointer>
	| GetOperationAst<TSchema, TFilter, TSelectedField, TIncludedPointer>
	| CountOperationAst<TSchema, TFilter, TSelectedField>
	| ExistsOperationAst<TSchema, TFilter, TSelectedField>
	| CreateOneOperationAst<TSchema>
	| CreateManyOperationAst<TSchema, TAtomic, TSelectedField>
	| UpdateOneOperationAst<
			TSchema,
			TUpdate,
			TFilter,
			TSelectedField,
			TIncludedPointer
	  >
	| UpdateManyOperationAst<TSchema, TUpdate, TFilter, TSelectedField>
	| UpsertOneOperationAst<
			TSchema,
			TUpdate,
			TFilter,
			TSelectedField,
			TIncludedPointer
	  >
	| UpsertManyOperationAst<TSchema, TUpdate, TFilter, TAtomic, TSelectedField>
	| DeleteOneOperationAst<TSchema, TFilter, TSelectedField, TIncludedPointer>
	| DeleteManyOperationAst<TSchema, TFilter, TSelectedField>

/** Accepts every normalized operation specialization for one schema. */
export type ExecutableOperationAst<
	TSchema extends SchemaDefinition = SchemaDefinition,
> = OperationAst<
	TSchema,
	UpdateExpressionNode,
	QueryExpressionNode,
	QueryFieldName<TSchema>,
	boolean,
	unknown
>

/** Extracts the stable discriminant union used by adapters and hook registries. */
export type OperationKind = OperationAst<SchemaDefinition>['kind']
