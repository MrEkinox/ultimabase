import type {
	InferCreateInput,
	InferObject,
	SchemaDefinition,
} from '@ultimabase/schema'

import type {
	QueryAst,
	QueryExpressionNode,
	QuerySchemaNode,
} from '../ast/contracts.js'
import type { QueryFilterNode } from '../filters/logical.js'

/** Marks every terminal operation with one exhaustively matchable discriminant. */
export interface OperationAstNode {
	readonly kind: string
}

/** Leaves concrete atomic update operators to their dedicated AST capability. */
export interface UpdateExpressionNode {
	readonly kind: string
}

/** Carries the only execution behavior configurable by normalized bulk writes. */
export interface AtomicBulkOperationOptions {
	readonly atomic: boolean
}

/** Infers the framework identifier type retained by the exact schema. */
export type OperationObjectId<TSchema extends SchemaDefinition> =
	InferObject<TSchema> extends { readonly id: infer TId } ? TId : never

type OperationQuery<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode,
> = QueryAst<TSchema, TFilter>

interface QueryOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode,
> extends OperationAstNode {
	readonly query: OperationQuery<TSchema, TFilter>
}

interface SchemaOperationAst<
	TSchema extends SchemaDefinition,
> extends OperationAstNode {
	readonly schema: QuerySchemaNode<TSchema>
}

/** Reads every object selected by one query. */
export interface FindOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> extends QueryOperationAst<TSchema, TFilter> {
	readonly kind: 'find'
}

/** Reads at most the first object selected by one query. */
export interface FirstOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> extends QueryOperationAst<TSchema, TFilter> {
	readonly kind: 'first'
}

/** Reads one identifier while preserving the query's selection and filters. */
export interface GetOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> extends QueryOperationAst<TSchema, TFilter> {
	readonly kind: 'get'
	readonly id: OperationObjectId<TSchema>
}

/** Counts every object selected by one query without loading result objects. */
export interface CountOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> extends QueryOperationAst<TSchema, TFilter> {
	readonly kind: 'count'
}

/** Tests whether one query selects at least one object. */
export interface ExistsOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> extends QueryOperationAst<TSchema, TFilter> {
	readonly kind: 'exists'
}

/** Creates exactly one object from its schema-derived input shape. */
export interface CreateOneOperationAst<
	TSchema extends SchemaDefinition,
> extends SchemaOperationAst<TSchema> {
	readonly kind: 'create-one'
	readonly input: InferCreateInput<TSchema>
}

/** Creates an ordered collection with explicit normalized atomic behavior. */
export interface CreateManyOperationAst<
	TSchema extends SchemaDefinition,
> extends SchemaOperationAst<TSchema> {
	readonly kind: 'create-many'
	readonly inputs: readonly InferCreateInput<TSchema>[]
	readonly options: AtomicBulkOperationOptions
}

/** Applies one atomic update expression to at most one selected object. */
export interface UpdateOneOperationAst<
	TSchema extends SchemaDefinition,
	TUpdate extends UpdateExpressionNode = UpdateExpressionNode,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> extends QueryOperationAst<TSchema, TFilter> {
	readonly kind: 'update-one'
	readonly update: TUpdate
}

/** Applies one atomic update expression to every selected object. */
export interface UpdateManyOperationAst<
	TSchema extends SchemaDefinition,
	TUpdate extends UpdateExpressionNode = UpdateExpressionNode,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> extends QueryOperationAst<TSchema, TFilter> {
	readonly kind: 'update-many'
	readonly update: TUpdate
}

/** Keeps the unique target, create input, and update expression independent. */
export interface UpsertOneOperationAst<
	TSchema extends SchemaDefinition,
	TUpdate extends UpdateExpressionNode = UpdateExpressionNode,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> extends QueryOperationAst<TSchema, TFilter> {
	readonly kind: 'upsert-one'
	readonly create: InferCreateInput<TSchema>
	readonly update: TUpdate
}

/** Represents one ordered item inside a bulk upsert operation. */
export interface UpsertOperationItem<
	TSchema extends SchemaDefinition,
	TUpdate extends UpdateExpressionNode = UpdateExpressionNode,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> {
	readonly query: OperationQuery<TSchema, TFilter>
	readonly create: InferCreateInput<TSchema>
	readonly update: TUpdate
}

/** Upserts an ordered collection with explicit normalized atomic behavior. */
export interface UpsertManyOperationAst<
	TSchema extends SchemaDefinition,
	TUpdate extends UpdateExpressionNode = UpdateExpressionNode,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> extends SchemaOperationAst<TSchema> {
	readonly kind: 'upsert-many'
	readonly items: readonly UpsertOperationItem<TSchema, TUpdate, TFilter>[]
	readonly options: AtomicBulkOperationOptions
}

/** Deletes at most one object selected by one query. */
export interface DeleteOneOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> extends QueryOperationAst<TSchema, TFilter> {
	readonly kind: 'delete-one'
}

/** Deletes every object selected by one query and later returns its count. */
export interface DeleteManyOperationAst<
	TSchema extends SchemaDefinition,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> extends QueryOperationAst<TSchema, TFilter> {
	readonly kind: 'delete-many'
}

/** Enumerates every terminal operation accepted by the single Runtime pipeline. */
export type OperationAst<
	TSchema extends SchemaDefinition,
	TUpdate extends UpdateExpressionNode = UpdateExpressionNode,
	TFilter extends QueryExpressionNode = QueryFilterNode<TSchema>,
> =
	| FindOperationAst<TSchema, TFilter>
	| FirstOperationAst<TSchema, TFilter>
	| GetOperationAst<TSchema, TFilter>
	| CountOperationAst<TSchema, TFilter>
	| ExistsOperationAst<TSchema, TFilter>
	| CreateOneOperationAst<TSchema>
	| CreateManyOperationAst<TSchema>
	| UpdateOneOperationAst<TSchema, TUpdate, TFilter>
	| UpdateManyOperationAst<TSchema, TUpdate, TFilter>
	| UpsertOneOperationAst<TSchema, TUpdate, TFilter>
	| UpsertManyOperationAst<TSchema, TUpdate, TFilter>
	| DeleteOneOperationAst<TSchema, TFilter>
	| DeleteManyOperationAst<TSchema, TFilter>

/** Extracts the stable discriminant union used by adapters and hook registries. */
export type OperationKind = OperationAst<SchemaDefinition>['kind']
