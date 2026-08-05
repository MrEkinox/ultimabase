import type {
	FieldScalarValue,
	FieldInferenceStateOf,
	FieldList,
	GenericField,
	InferObject,
	JsonDocument,
	JsonObject,
	JsonValue,
	SchemaDefinition,
} from '../../schema/index.js'

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
	'pointer',
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

/** Represents inclusive interval membership and its inverse. */
export type QueryRangeFilterOperator = 'between' | 'not-between'

export type QueryMembershipFilterOperator = 'in' | 'not-in'

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

type QueryFieldDefinition<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = TSchema['fields'][TFieldName]

type QueryFieldValueForDefinition<TField extends GenericField> =
	FieldInferenceStateOf<TField>['nullable'] extends true
		? FieldScalarValue<TField> | null
		: FieldScalarValue<TField>

type QueryDeepPartial<TValue> = TValue extends readonly (infer TItem)[]
	? readonly QueryDeepPartial<TItem>[]
	: TValue extends Readonly<Record<string, unknown>>
		? { readonly [TKey in keyof TValue]?: QueryDeepPartial<TValue[TKey]> }
		: TValue

type QueryStructuralValueForDefinition<TField extends GenericField> =
	TField extends { readonly kind: 'json' }
		? JsonDocument
		: TField extends { readonly kind: 'object' }
			? QueryDeepPartial<Exclude<FieldScalarValue<TField>, null>>
			: never

type QueryStructuralKeyForDefinition<TField extends GenericField> =
	TField extends { readonly kind: 'object' }
		? Extract<keyof Exclude<FieldScalarValue<TField>, null>, string>
		: string

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
		? | QueryComparisonFilterNode<
					TFieldName,
					Exclude<QueryFilterValue<TSchema, TFieldName>, null>
			  >
			| QueryRangeFilterNode<
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
	| QueryNullFilterNode<TFieldName>
	| (IsScalarQueryField<TSchema, TFieldName> extends true
			? | QueryScalarPrimitiveFilterNode<TSchema, TFieldName>
				| QueryStructuredPrimitiveFilterNode<TSchema, TFieldName>
			: never)

type QueryStructuredPrimitiveFilterNode<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> =
	QueryFieldKind<TSchema, TFieldName> extends 'json' | 'object'
		? | QueryStructuralContainmentFilterNode<
					TFieldName,
					QueryStructuralValueForDefinition<
						Extract<QueryFieldDefinition<TSchema, TFieldName>, GenericField>
					>
			  >
			| QueryKeyFilterNode<
					TFieldName,
					QueryStructuralKeyForDefinition<
						Extract<QueryFieldDefinition<TSchema, TFieldName>, GenericField>
					>
			  >
			| QueryKeysFilterNode<
					TFieldName,
					QueryStructuralKeyForDefinition<
						Extract<QueryFieldDefinition<TSchema, TFieldName>, GenericField>
					>
			  >
			| QueryJsonPathFilterNode<TFieldName>
		: never

type QueryPathFilterForDefinition<
	TField extends GenericField,
	TRootFieldName extends string,
	TPath extends readonly [string, ...string[]],
> =
	| QueryNullFilterNode<TRootFieldName, TPath>
	| (FieldInferenceStateOf<TField>['list'] extends FieldList
			? never
			: | (TField['kind'] extends QueryEqualityFieldKind
						? | QueryEqualityFilterNode<
									TRootFieldName,
									QueryFieldValueForDefinition<TField>,
									TPath
							  >
							| QueryMembershipFilterNode<
									TRootFieldName,
									QueryFieldValueForDefinition<TField>,
									TPath
							  >
						: never)
				| (TField['kind'] extends 'string'
						? QueryStringFilterNode<
								TRootFieldName,
								Extract<QueryFieldValueForDefinition<TField>, string>,
								TPath
							>
						: never)
				| (TField['kind'] extends 'json' | 'object'
						? | QueryStructuralContainmentFilterNode<
									TRootFieldName,
									TField['kind'] extends 'json'
										? JsonDocument
										: QueryStructuralValueForDefinition<TField>,
									TPath
							  >
							| QueryKeyFilterNode<
									TRootFieldName,
									QueryStructuralKeyForDefinition<TField>,
									TPath
							  >
							| QueryKeysFilterNode<
									TRootFieldName,
									QueryStructuralKeyForDefinition<TField>,
									TPath
							  >
							| QueryJsonPathFilterNode<TRootFieldName, TPath>
						: never))

type QueryDynamicJsonPathFilterNode<
	TRootFieldName extends string,
	TPath extends readonly [string, ...string[]],
> =
	| QueryEqualityFilterNode<TRootFieldName, JsonValue, TPath>
	| QueryMembershipFilterNode<TRootFieldName, JsonValue, TPath>
	| QueryNullFilterNode<TRootFieldName, TPath>
	| QueryStructuralContainmentFilterNode<TRootFieldName, JsonValue, TPath>
	| QueryKeyFilterNode<TRootFieldName, string, TPath>
	| QueryKeysFilterNode<TRootFieldName, string, TPath>
	| QueryJsonPathFilterNode<TRootFieldName, TPath>

type MaximumQueryFieldPathDepth = 12

type AppendQueryFieldPath<
	TParentPath extends readonly string[],
	TName extends string,
> = TParentPath extends readonly []
	? readonly [TName]
	: TParentPath extends readonly [
				infer TFirst extends string,
				...infer TRest extends string[],
		  ]
		? readonly [TFirst, ...TRest, TName]
		: never

type AppendDynamicQueryFieldPath<
	TParentPath extends readonly string[],
	TName extends string,
> =
	AppendQueryFieldPath<TParentPath, TName> extends readonly [
		infer TFirst extends string,
		...infer TRest extends string[],
	]
		? readonly [TFirst, ...TRest, string, ...string[]]
		: never

type QueryObjectPathFilterNode<
	TFields extends Readonly<Record<string, GenericField>>,
	TRootFieldName extends string,
	TParentPath extends readonly string[] = readonly [],
	TDepth extends readonly unknown[] = readonly [],
> = {
	readonly [TName in Extract<keyof TFields, string>]:
		| QueryPathFilterForDefinition<
				TFields[TName],
				TRootFieldName,
				AppendQueryFieldPath<TParentPath, TName>
		  >
		| (TFields[TName] extends {
				readonly kind: 'object'
				readonly options: {
					readonly fields: infer TChildren extends Readonly<
						Record<string, GenericField>
					>
				}
		  }
				? FieldInferenceStateOf<TFields[TName]>['list'] extends FieldList
					? never
					: TDepth['length'] extends MaximumQueryFieldPathDepth
						? never
						: QueryObjectPathFilterNode<
								TChildren,
								TRootFieldName,
								AppendQueryFieldPath<TParentPath, TName>,
								readonly [...TDepth, unknown]
							>
				: never)
		| (TFields[TName] extends { readonly kind: 'json' }
				? FieldInferenceStateOf<TFields[TName]>['list'] extends FieldList
					? never
					: QueryDynamicJsonPathFilterNode<
							TRootFieldName,
							AppendDynamicQueryFieldPath<TParentPath, TName>
						>
				: never)
}[Extract<keyof TFields, string>]

type QueryPathPrimitiveFilterForField<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> =
	QueryFieldDefinition<TSchema, TFieldName> extends infer TField extends
		GenericField
		? FieldInferenceStateOf<TField>['list'] extends FieldList
			? never
			: TField extends { readonly kind: 'json' }
				? QueryDynamicJsonPathFilterNode<
						TFieldName,
						readonly [string, ...string[]]
					>
				: TField extends {
							readonly kind: 'object'
							readonly options: {
								readonly fields: infer TFields extends Readonly<
									Record<string, GenericField>
								>
							}
					  }
					? QueryObjectPathFilterNode<TFields, TFieldName>
					: never
		: never

type QueryPathPrimitiveFilterNode<TSchema extends SchemaDefinition> = {
	readonly [
		TFieldName in QueryFieldName<TSchema>
	]: QueryPathPrimitiveFilterForField<TSchema, TFieldName>
}[QueryFieldName<TSchema>]

/** Builds the field-correlated union consumed by Query and transport normalizers. */
export type QueryPrimitiveFilterNode<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema> = QueryFieldName<TSchema>,
> =
	| (TFieldName extends QueryFieldName<TSchema>
			? QueryPrimitiveFilterForField<TSchema, TFieldName>
			: never)
	| (TFieldName extends QueryFieldName<TSchema>
			? QueryPathPrimitiveFilterForField<TSchema, TFieldName>
			: never)

/** Extracts only operators that are legal for the selected schema field. */
export type QueryPrimitiveFilterOperator<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = QueryPrimitiveFilterForField<TSchema, TFieldName>['kind']

/** Selects schema fields that support one exact primitive filter operator. */
export type QueryFilterFieldName<
	TSchema extends SchemaDefinition,
	TOperator extends QueryBuiltInFilterOperator,
> = {
	[
		TFieldName in QueryFieldName<TSchema>
	]: TOperator extends QueryPrimitiveFilterOperator<TSchema, TFieldName>
		? TFieldName
		: never
}[QueryFieldName<TSchema>]

type QueryFilterTargetForNode<TNode> = TNode extends {
	readonly field: infer TFieldName extends string
	readonly path: infer TPath extends readonly [string, ...string[]]
}
	? QueryFieldPath<TFieldName, TPath>
	: TNode extends { readonly field: infer TFieldName extends string }
		? TFieldName
		: never

type QueryFilterTargetForUnion<TNode, TOperator> = TNode extends {
	readonly kind: infer TKind
}
	? TOperator extends TKind
		? QueryFilterTargetForNode<TNode>
		: never
	: never

/** Selects root fields and typed nested paths that support one operator. */
export type QueryFilterTarget<
	TSchema extends SchemaDefinition,
	TOperator extends QueryBuiltInFilterOperator,
> =
	| QueryFilterFieldName<TSchema, TOperator>
	| QueryFilterTargetForUnion<QueryPathPrimitiveFilterNode<TSchema>, TOperator>

type QueryFilterNodeForTarget<
	TSchema extends SchemaDefinition,
	TOperator extends QueryBuiltInFilterOperator,
	TTarget,
> =
	QueryPrimitiveFilterNode<TSchema> extends infer TNode
		? TNode extends {
				readonly kind: infer TKind
				readonly field: infer TFieldName
			}
			? TOperator extends TKind
				? TTarget extends QueryFieldPath<
						infer TTargetFieldName,
						infer TTargetPath
					>
					? TNode extends {
							readonly field: TTargetFieldName
							readonly path: TTargetPath
						}
						? TNode
						: never
					: TFieldName extends TTarget
						? TNode extends { readonly path: readonly string[] }
							? never
							: TNode
						: never
				: never
			: never
		: never

/** Resolves the exact single operand accepted by one target and operator. */
export type QueryFilterOperand<
	TSchema extends SchemaDefinition,
	TOperator extends QueryBuiltInFilterOperator,
	TTarget extends QueryFilterTarget<TSchema, TOperator>,
> =
	QueryFilterNodeForTarget<TSchema, TOperator, TTarget> extends {
		readonly value: infer TValue
	}
		? TValue
		: QueryFilterNodeForTarget<TSchema, TOperator, TTarget> extends {
					readonly values: readonly (infer TValue)[]
			  }
			? TValue
			: QueryFilterNodeForTarget<TSchema, TOperator, TTarget> extends {
						readonly keys: readonly (infer TValue)[]
				  }
				? TValue
				: never
