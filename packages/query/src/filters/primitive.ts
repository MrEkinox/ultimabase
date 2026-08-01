import type {
	FieldInferenceStateOf,
	FieldList,
	InferObject,
	SchemaDefinition,
} from '@ultimabase/schema'

import type { QueryExpressionNode, QueryFieldName } from '../ast/contracts.js'

/** Keeps runtime checks and type-level equality capabilities from drifting apart. */
export const queryEqualityFieldKinds = [
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'string',
	'time',
	'uuid',
] as const

type QueryEqualityFieldKind = (typeof queryEqualityFieldKinds)[number]

/** Keeps runtime checks and type-level ordering capabilities from drifting apart. */
export const queryOrderedFieldKinds = [
	'bigint',
	'date',
	'dateTime',
	'decimal',
	'float',
	'int',
	'string',
	'time',
] as const

type QueryOrderedFieldKind = (typeof queryOrderedFieldKinds)[number]

export type QueryEqualityFilterOperator = 'equal' | 'not-equal'

export type QueryComparisonFilterOperator =
	'greater-than' | 'greater-than-or-equal' | 'less-than' | 'less-than-or-equal'

export type QueryMembershipFilterOperator = 'in' | 'not-in'

export type QueryStringFilterOperator = 'contains' | 'starts-with' | 'ends-with'

/** Keeps regex behavior declarative and independent from JavaScript RegExp state. */
export type QueryRegexFlag =
	'case-insensitive' | 'dot-matches-newline' | 'multiline'

export interface QueryRegexPattern {
	readonly source: string
	readonly flags: readonly QueryRegexFlag[]
}

/** Reuses one immutable field-and-value shape across compatible operators. */
interface QueryValueFilterNode<
	TOperator extends string,
	TFieldName extends string = string,
	TValue = unknown,
> extends QueryExpressionNode {
	readonly kind: TOperator
	readonly field: TFieldName
	readonly value: TValue
}

/** Represents one equality comparison against a scalar field value. */
export type QueryEqualityFilterNode<
	TFieldName extends string = string,
	TValue = unknown,
> = QueryValueFilterNode<QueryEqualityFilterOperator, TFieldName, TValue>

/** Represents one ordered comparison against a non-null scalar value. */
export type QueryComparisonFilterNode<
	TFieldName extends string = string,
	TValue = unknown,
> = QueryValueFilterNode<QueryComparisonFilterOperator, TFieldName, TValue>

/** Compares one scalar field against an immutable candidate collection. */
export interface QueryMembershipFilterNode<
	TFieldName extends string = string,
	TValue = unknown,
> extends QueryExpressionNode {
	readonly kind: QueryMembershipFilterOperator
	readonly field: TFieldName
	readonly values: readonly TValue[]
}

/** Represents portable substring matching for a scalar string field. */
export type QueryStringFilterNode<
	TFieldName extends string = string,
	TValue = string,
> = QueryValueFilterNode<QueryStringFilterOperator, TFieldName, TValue>

/** Carries a regex as inert data for a later adapter compiler. */
export interface QueryRegexFilterNode<
	TFieldName extends string = string,
> extends QueryExpressionNode {
	readonly kind: 'regex'
	readonly field: TFieldName
	readonly pattern: QueryRegexPattern
}

/** Tests field presence without assuming a physical storage representation. */
export interface QueryExistenceFilterNode<
	TFieldName extends string = string,
> extends QueryExpressionNode {
	readonly kind: 'exists'
	readonly field: TFieldName
	readonly exists: boolean
}

type QueryFieldDefinition<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = TSchema['fields'][TFieldName]

type QueryFieldKind<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> =
	QueryFieldDefinition<TSchema, TFieldName> extends {
		readonly kind: infer TKind extends string
	}
		? TKind
		: never

type IsScalarQueryField<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = FieldInferenceStateOf<
	QueryFieldDefinition<TSchema, TFieldName>
>['list'] extends FieldList
	? false
	: true

/** Infers the persisted field value while excluding optional-property absence. */
export type QueryFilterValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = TFieldName extends keyof InferObject<TSchema>
	? Exclude<InferObject<TSchema>[TFieldName], undefined>
	: never

type QueryScalarPrimitiveFilterNode<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = [QueryFilterValue<TSchema, TFieldName>] extends [never]
	? never
	: | QueryEqualityPrimitiveFilterNode<TSchema, TFieldName>
		| QueryOrderedPrimitiveFilterNode<TSchema, TFieldName>
		| QueryStringPrimitiveFilterNode<TSchema, TFieldName>

type QueryEqualityPrimitiveFilterNode<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> =
	QueryFieldKind<TSchema, TFieldName> extends QueryEqualityFieldKind
		? | QueryEqualityFilterNode<
					TFieldName,
					QueryFilterValue<TSchema, TFieldName>
			  >
			| QueryMembershipFilterNode<
					TFieldName,
					QueryFilterValue<TSchema, TFieldName>
			  >
		: never

type QueryOrderedPrimitiveFilterNode<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> =
	QueryFieldKind<TSchema, TFieldName> extends QueryOrderedFieldKind
		? QueryComparisonFilterNode<
				TFieldName,
				Exclude<QueryFilterValue<TSchema, TFieldName>, null>
			>
		: never

type QueryStringPrimitiveFilterNode<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> =
	QueryFieldKind<TSchema, TFieldName> extends 'string'
		? Extract<QueryFilterValue<TSchema, TFieldName>, string> extends never
			? never
			: | QueryStringFilterNode<
						TFieldName,
						Extract<QueryFilterValue<TSchema, TFieldName>, string>
				  >
				| QueryRegexFilterNode<TFieldName>
		: never

type QueryPrimitiveFilterForField<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> =
	| QueryExistenceFilterNode<TFieldName>
	| (IsScalarQueryField<TSchema, TFieldName> extends true
			? QueryScalarPrimitiveFilterNode<TSchema, TFieldName>
			: never)

/** Builds the field-correlated union consumed by Query and transport normalizers. */
export type QueryPrimitiveFilterNode<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema> = QueryFieldName<TSchema>,
> =
	TFieldName extends QueryFieldName<TSchema>
		? QueryPrimitiveFilterForField<TSchema, TFieldName>
		: never

/** Extracts only operators that are legal for the selected schema field. */
export type QueryPrimitiveFilterOperator<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = QueryPrimitiveFilterNode<TSchema, TFieldName>['kind']

/** Selects schema fields that support one exact primitive filter operator. */
export type QueryFilterFieldName<
	TSchema extends SchemaDefinition,
	TOperator extends QueryPrimitiveFilterNode<TSchema>['kind'],
> = {
	[
		TFieldName in QueryFieldName<TSchema>
	]: TOperator extends QueryPrimitiveFilterOperator<TSchema, TFieldName>
		? TFieldName
		: never
}[QueryFieldName<TSchema>]
