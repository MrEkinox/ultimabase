import type { JsonObject, JsonValue } from '../schema/index.js'

import type {
	QueryJsonPathExpression,
	QueryRegexPattern,
} from './filters/primitive.js'
import type { QueryOrderByDirection } from './query/input.js'

/** Shares recursive transport-facing AND, OR, and NOT branches by named where type. */
export interface GeneratedWhereBranches<TWhere> {
	readonly AND?: readonly TWhere[]
	readonly NOT?: TWhere
	readonly OR?: readonly TWhere[]
}

/** Adds shared recursive branches to an anonymous generated field map. */
export type GeneratedWhere<TFields extends object> = Readonly<
	TFields & {
		readonly AND?: readonly GeneratedWhere<TFields>[]
		readonly NOT?: GeneratedWhere<TFields>
		readonly OR?: readonly GeneratedWhere<TFields>[]
	}
>

/** Shares equality and membership operators across generated scalar fields. */
export interface GeneratedEqualityWhere<TValue> {
	readonly eq?: TValue
	readonly in?: readonly TValue[]
	readonly ne?: TValue
	readonly notIn?: readonly TValue[]
}

/** Shares ordered comparison and inclusive range operators. */
export interface GeneratedOrderedWhere<TValue> {
	readonly between?: Readonly<{ lower: TValue; upper: TValue }>
	readonly gt?: TValue
	readonly gte?: TValue
	readonly lt?: TValue
	readonly lte?: TValue
	readonly notBetween?: Readonly<{ lower: TValue; upper: TValue }>
}

/** Shares string-specific substring and inert regular-expression operators. */
export interface GeneratedStringWhere<TValue extends string = string> {
	readonly contains?: TValue
	readonly endsWith?: TValue
	readonly matches?: QueryRegexPattern
	readonly startsWith?: TValue
}

/** Adds explicit null-state checks only to generated nullable values. */
export interface GeneratedNullableWhere {
	readonly isNotNull?: true
	readonly isNull?: true
}

/** Recursively makes a generated structured value suitable for containment. */
export type GeneratedDeepPartial<TValue> =
	TValue extends readonly (infer TItem)[]
		? readonly GeneratedDeepPartial<TItem>[]
		: TValue extends Readonly<Record<string, unknown>>
			? { readonly [TKey in keyof TValue]?: GeneratedDeepPartial<TValue[TKey]> }
			: TValue

/** Shares JSONB-style containment, key, and JSONPath operators. */
export interface GeneratedStructuralWhere<
	TValue,
	TKey extends string = string,
> {
	readonly containedBy?: TValue
	readonly contains?: TValue
	readonly hasAllKeys?: readonly TKey[]
	readonly hasAnyKeys?: readonly TKey[]
	readonly hasKey?: TKey
	readonly jsonPathExists?: QueryJsonPathExpression
	readonly jsonPathMatches?: QueryJsonPathExpression
}

/** Correlates one generated structured path with its legal operators. */
export type GeneratedPathWhere<
	TPath extends readonly [string, ...string[]],
	TWhere extends object,
> = Readonly<{ readonly path: TPath } & TWhere>

/** Provides dynamic path operators for untyped JSON documents. */
export type GeneratedJsonPathWhere<
	TPath extends readonly [string, ...string[]] = readonly [string, ...string[]],
> = GeneratedPathWhere<
	TPath,
	GeneratedEqualityWhere<JsonValue> &
		GeneratedStructuralWhere<JsonValue> &
		GeneratedNullableWhere
>

/** Shares the integer comparisons used by relation cardinality filters. */
export type GeneratedRelationCountWhere<TWhere> =
	GeneratedEqualityWhere<number> &
		GeneratedOrderedWhere<number> &
		Readonly<{ readonly where?: TWhere }>

/** Describes one generated pointer identity and optional target traversal. */
export type GeneratedPointerWhere<TWhere> = GeneratedEqualityWhere<string> &
	Readonly<{
		readonly is?: TWhere
		readonly isNot?: TWhere
	}>

/** Describes one generated to-many relation predicate and cardinality filter. */
export interface GeneratedRelationWhere<TWhere> {
	readonly count?: GeneratedRelationCountWhere<TWhere>
	readonly every?: TWhere
	readonly isEmpty?: true
	readonly isNotEmpty?: true
	readonly none?: TWhere
	readonly some?: TWhere
}

/** Projects exact generated logical field names with true or false flags. */
export type GeneratedSelect<TFieldName extends string> = Readonly<
	Partial<Record<TFieldName, boolean>>
>

type OtherGeneratedFieldName<
	TFieldName extends string,
	TSelected extends TFieldName,
> = Exclude<TFieldName, TSelected>

/** Keeps every generated order object limited to one field. */
export type GeneratedOrderBy<TFieldName extends string> = {
	readonly [TSelected in TFieldName]: Readonly<
		Record<TSelected, QueryOrderByDirection> &
			Partial<Record<OtherGeneratedFieldName<TFieldName, TSelected>, never>>
	>
}[TFieldName]

/** Shapes one singular generated inclusion target. */
export interface GeneratedPointerInclude<TSelect, TInclude> {
	readonly include?: TInclude
	readonly select?: TSelect
}

/** Shapes one independently filtered generated collection inclusion. */
export interface GeneratedRelationInclude<
	TWhere,
	TSelect,
	TOrderBy,
	TInclude,
> extends GeneratedPointerInclude<TSelect, TInclude> {
	readonly limit?: number
	readonly offset?: number
	readonly orderBy?: readonly TOrderBy[]
	readonly where?: TWhere
}

/** Names the untyped JSON object used by generated JSONPath variables. */
export type GeneratedJsonPathVariables = JsonObject
