import type {
	JsonObject,
	JsonValue,
	SchemaDefinition,
} from '../../schema/index.js'

import type { QueryExpressionNode, QueryFieldName } from '../ast/contracts.js'

export {
	equalityFieldKinds as queryEqualityFieldKinds,
	orderedFieldKinds as queryOrderedFieldKinds,
} from '../../schema/fields/base/filter-kinds.js'

export type QueryEqualityFilterOperator = 'equal' | 'not-equal'

export type QueryComparisonFilterOperator =
	'greater-than' | 'greater-than-or-equal' | 'less-than' | 'less-than-or-equal'

/** Represents inclusive interval membership and its inverse. */
export type QueryRangeFilterOperator = 'between' | 'not-between'

export type QueryMembershipFilterOperator = 'in' | 'not-in'

/** Represents membership and emptiness checks for one-dimensional field lists. */
export type QueryListFilterOperator =
	'list-empty' | 'list-has' | 'list-has-every' | 'list-has-some'

export type QueryStringFilterOperator = 'contains' | 'starts-with' | 'ends-with'

/** Represents JSONB-style structural containment and its inverse. */
export type QueryStructuralContainmentFilterOperator =
	'contained-by' | 'contains'

/** Represents top-level key tests shared by typed and untyped structures. */
export type QueryKeyFilterOperator = 'has-all-keys' | 'has-any-keys' | 'has-key'

/** Selects whether JSONPath returns an item or evaluates one boolean predicate. */
export type QueryJsonPathFilterOperator =
	'json-path-exists' | 'json-path-matches'

/** Lists every first-party filter discriminant accepted by public builders. */
export type QueryBuiltInFilterOperator =
	| QueryComparisonFilterOperator
	| QueryEqualityFilterOperator
	| QueryJsonPathFilterOperator
	| QueryKeyFilterOperator
	| QueryListFilterOperator
	| QueryMembershipFilterOperator
	| QueryRangeFilterOperator
	| QueryStringFilterOperator
	| QueryStructuralContainmentFilterOperator
	| 'null'
	| 'regex'

/** Keeps regex behavior declarative and independent from JavaScript RegExp state. */
export type QueryRegexFlag =
	'case-insensitive' | 'dot-matches-newline' | 'multiline'

export interface QueryRegexPattern {
	readonly source: string
	readonly flags: readonly QueryRegexFlag[]
}

/** Reuses one immutable field-and-value shape across compatible operators. */
type QueryFilterPathProperty<TPath extends readonly string[] | undefined> =
	TPath extends readonly string[]
		? Readonly<{ path: TPath }>
		: Readonly<{ path?: never }>

type QueryValueFilterNode<
	TOperator extends string,
	TFieldName extends string = string,
	TValue = unknown,
	TPath extends readonly string[] | undefined = undefined,
> = QueryExpressionNode &
	Readonly<{
		kind: TOperator
		field: TFieldName
		value: TValue
	}> &
	QueryFilterPathProperty<TPath>

/** Represents one equality comparison against a scalar field value. */
export type QueryEqualityFilterNode<
	TFieldName extends string = string,
	TValue = unknown,
	TPath extends readonly string[] | undefined = undefined,
> = QueryValueFilterNode<QueryEqualityFilterOperator, TFieldName, TValue, TPath>

/** Represents one ordered comparison against a non-null scalar value. */
export type QueryComparisonFilterNode<
	TFieldName extends string = string,
	TValue = unknown,
> = QueryValueFilterNode<QueryComparisonFilterOperator, TFieldName, TValue>

/** Carries both inclusive bounds of one ordered scalar interval. */
export interface QueryRangeFilterNode<
	TFieldName extends string = string,
	TValue = unknown,
> extends QueryExpressionNode {
	readonly kind: QueryRangeFilterOperator
	readonly field: TFieldName
	readonly lower: TValue
	readonly upper: TValue
}

/** Compares one scalar field against an immutable candidate collection. */
export type QueryMembershipFilterNode<
	TFieldName extends string = string,
	TValue = unknown,
	TPath extends readonly string[] | undefined = undefined,
> = QueryExpressionNode &
	Readonly<{
		kind: QueryMembershipFilterOperator
		field: TFieldName
		values: readonly TValue[]
	}> &
	QueryFilterPathProperty<TPath>

/** Tests whether a field list contains one exact logical element. */
export type QueryListHasFilterNode<
	TFieldName extends string = string,
	TValue = unknown,
	TPath extends readonly string[] | undefined = undefined,
> = QueryValueFilterNode<'list-has', TFieldName, TValue, TPath>

/** Tests whether a field list contains some or every requested element. */
export type QueryListMembershipFilterNode<
	TFieldName extends string = string,
	TValue = unknown,
	TPath extends readonly string[] | undefined = undefined,
> = QueryExpressionNode &
	Readonly<{
		kind: 'list-has-every' | 'list-has-some'
		field: TFieldName
		values: readonly TValue[]
	}> &
	QueryFilterPathProperty<TPath>

/** Tests whether a non-null field list contains no elements. */
export type QueryListEmptyFilterNode<
	TFieldName extends string = string,
	TPath extends readonly string[] | undefined = undefined,
> = QueryExpressionNode &
	Readonly<{
		kind: 'list-empty'
		field: TFieldName
	}> &
	QueryFilterPathProperty<TPath>

/** Represents portable substring matching for a scalar string field. */
export type QueryStringFilterNode<
	TFieldName extends string = string,
	TValue = string,
	TPath extends readonly string[] | undefined = undefined,
> = QueryValueFilterNode<QueryStringFilterOperator, TFieldName, TValue, TPath>

/** Compares one JSON-compatible structure with a field or extracted path. */
export type QueryStructuralContainmentFilterNode<
	TFieldName extends string = string,
	TValue = JsonValue,
	TPath extends readonly string[] | undefined = undefined,
> = QueryValueFilterNode<
	QueryStructuralContainmentFilterOperator,
	TFieldName,
	TValue,
	TPath
>

/** Tests one key without exposing PostgreSQL operator syntax in the AST. */
export type QueryKeyFilterNode<
	TFieldName extends string = string,
	TKey extends string = string,
	TPath extends readonly string[] | undefined = undefined,
> = QueryValueFilterNode<'has-key', TFieldName, TKey, TPath>

/** Tests an immutable collection of top-level keys. */
export type QueryKeysFilterNode<
	TFieldName extends string = string,
	TKey extends string = string,
	TPath extends readonly string[] | undefined = undefined,
> = QueryExpressionNode &
	Readonly<{
		kind: 'has-all-keys' | 'has-any-keys'
		field: TFieldName
		keys: readonly TKey[]
	}> &
	QueryFilterPathProperty<TPath>

/** Carries one advanced JSONPath expression as inert, transport-safe data. */
export interface QueryJsonPathExpression {
	readonly source: string
	readonly variables?: JsonObject
}

/** Applies one intentionally untyped JSONPath expression to a structured target. */
export type QueryJsonPathFilterNode<
	TFieldName extends string = string,
	TPath extends readonly string[] | undefined = undefined,
> = QueryExpressionNode &
	Readonly<{
		kind: QueryJsonPathFilterOperator
		field: TFieldName
		source: string
		variables?: JsonObject
	}> &
	QueryFilterPathProperty<TPath>

/** Carries a regex as inert data for a later adapter compiler. */
export interface QueryRegexFilterNode<
	TFieldName extends string = string,
> extends QueryExpressionNode {
	readonly kind: 'regex'
	readonly field: TFieldName
	readonly pattern: QueryRegexPattern
}

/** Tests whether one selected logical field contains null. */
export type QueryNullFilterNode<
	TFieldName extends string = string,
	TPath extends readonly string[] | undefined = undefined,
> = QueryExpressionNode &
	Readonly<{
		kind: 'null'
		field: TFieldName
		isNull: boolean
	}> &
	QueryFilterPathProperty<TPath>

/** Identifies a nested structured value without flattening user-owned key names. */
export interface QueryFieldPath<
	TFieldName extends string = string,
	TPath extends readonly [string, ...string[]] = readonly [string, ...string[]],
> {
	readonly kind: 'field-path'
	readonly field: TFieldName
	readonly path: TPath
}

/**
 * Lists portable primitive leaves without reconstructing field capabilities.
 *
 * Generated Where contracts and WhereBuilder provide the application-facing
 * operator precision. These AST nodes stay intentionally broad because runtime
 * field metadata is the authority that validates normalized external input.
 */
export interface QueryPrimitiveFilterNode<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema> = QueryFieldName<TSchema>,
> extends QueryExpressionNode {
	readonly field: TFieldName
	readonly isNull?: boolean
	readonly keys?: readonly string[]
	readonly kind: QueryBuiltInFilterOperator
	readonly lower?: unknown
	readonly path?: readonly [string, ...string[]]
	readonly pattern?: QueryRegexPattern
	readonly source?: string
	readonly upper?: unknown
	readonly value?: unknown
	readonly values?: readonly unknown[]
	readonly variables?: JsonObject
}

/** Keeps bootstrap filter values unknown until runtime validation. */
export type QueryFilterValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = TFieldName extends QueryFieldName<TSchema> ? unknown : never

/** Lists every portable primitive operator accepted by the AST boundary. */
export type QueryPrimitiveFilterOperator<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> =
	TFieldName extends QueryFieldName<TSchema>
		? QueryBuiltInFilterOperator
		: never

/** Selects fields without reconstructing their capabilities from local definitions. */
export type QueryFilterFieldName<
	TSchema extends SchemaDefinition,
	TOperator extends QueryBuiltInFilterOperator,
> = TOperator extends QueryBuiltInFilterOperator
	? QueryFieldName<TSchema>
	: never

/** Selects one root field or structured path for runtime capability validation. */
export type QueryFilterTarget<
	TSchema extends SchemaDefinition,
	TOperator extends QueryBuiltInFilterOperator,
> = TOperator extends QueryBuiltInFilterOperator
	? QueryFieldName<TSchema> | QueryFieldPath<QueryFieldName<TSchema>>
	: never

/** Keeps low-level AST operands unknown; generated authoring APIs remain exact. */
export type QueryFilterOperand<
	TSchema extends SchemaDefinition,
	TOperator extends QueryBuiltInFilterOperator,
	TTarget extends QueryFilterTarget<TSchema, TOperator>,
> = TTarget extends QueryFilterTarget<TSchema, TOperator> ? unknown : never
