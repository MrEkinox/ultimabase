import type { SchemaDefinition } from '@ultimabase/schema'

import type { QueryCursor } from '../cursor/contracts.js'

/** Extracts every developer and framework-owned field name from one schema. */
export type QueryFieldName<TSchema extends SchemaDefinition> = Extract<
	keyof TSchema['fields'],
	string
>

/** Retains the exact trusted schema used to type and execute a query later. */
export interface QuerySchemaNode<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	readonly kind: 'schema'
	readonly definition: TSchema
}

/** Identifies one selected field without attaching transport projection syntax. */
export interface QuerySelectedFieldNode<TFieldName extends string = string> {
	readonly kind: 'selected-field'
	readonly field: TFieldName
}

/** Groups the normalized fields requested from persisted objects. */
export interface QuerySelectionNode<TFieldName extends string = string> {
	readonly kind: 'selection'
	readonly fields: readonly QuerySelectedFieldNode<TFieldName>[]
}

/** Provides the neutral discriminant required by future filter node unions. */
export interface QueryExpressionNode {
	readonly kind: string
}

/** Wraps one filter expression while operators remain separate AST nodes. */
export interface QueryWhereNode<
	TExpression extends QueryExpressionNode = QueryExpressionNode,
> {
	readonly kind: 'where'
	readonly expression: TExpression
}

/** Defines portable ordering without leaking database-specific keywords. */
export type QueryOrderDirection = 'ascending' | 'descending'

/** Represents one deterministic field and direction pair. */
export interface QueryOrderNode<TFieldName extends string = string> {
	readonly kind: 'order'
	readonly field: TFieldName
	readonly direction: QueryOrderDirection
}

/** Groups normalized ordering terms in their application order. */
export interface QueryOrderingNode<TFieldName extends string = string> {
	readonly kind: 'ordering'
	readonly orders: readonly QueryOrderNode<TFieldName>[]
}

/** Represents portable offset pagination before cursor nodes are introduced. */
export interface QueryOffsetPaginationNode {
	readonly kind: 'offset-pagination'
	readonly limit: number | undefined
	readonly skip: number
}

/** Represents forward keyset pagination from an optional opaque cursor. */
export interface QueryCursorPaginationNode {
	readonly kind: 'cursor-pagination'
	readonly after: QueryCursor | undefined
	readonly limit: number
}

/** Leaves pagination extensible without exposing adapter-specific values. */
export type QueryPaginationNode =
	QueryOffsetPaginationNode | QueryCursorPaginationNode

/** Carries the complete transport-neutral state consumed by later operations. */
export interface QueryAst<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TExpression extends QueryExpressionNode = QueryExpressionNode,
> {
	readonly kind: 'query'
	readonly schema: QuerySchemaNode<TSchema>
	readonly selection: QuerySelectionNode<QueryFieldName<TSchema>>
	readonly where: QueryWhereNode<TExpression> | undefined
	readonly ordering: QueryOrderingNode<QueryFieldName<TSchema>>
	readonly pagination: QueryPaginationNode | undefined
}

/** Narrows the reusable empty state produced before any query clause is added. */
export interface InitialQueryAst<
	TSchema extends SchemaDefinition = SchemaDefinition,
> extends QueryAst<TSchema, never> {
	readonly selection: QuerySelectionNode<never>
	readonly where: undefined
	readonly ordering: QueryOrderingNode<never>
	readonly pagination: undefined
}

/** Unifies every structural query node for exhaustive visitors and compilers. */
export type QueryAstNode<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TExpression extends QueryExpressionNode = QueryExpressionNode,
> =
	| QueryAst<TSchema, TExpression>
	| QuerySchemaNode<TSchema>
	| QuerySelectionNode<QueryFieldName<TSchema>>
	| QuerySelectedFieldNode<QueryFieldName<TSchema>>
	| QueryWhereNode<TExpression>
	| TExpression
	| QueryOrderingNode<QueryFieldName<TSchema>>
	| QueryOrderNode<QueryFieldName<TSchema>>
	| QueryPaginationNode
