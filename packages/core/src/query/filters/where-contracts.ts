import type { SchemaDefinition } from '../../schema/index.js'
import type {
	SchemaTypeInfoSource,
	SchemaTypeValue,
} from '../../schema/type-info.js'
import type { ReservedQueryLogicalFieldName } from '../../schema/schema/reserved-field-names.js'
import type { QueryFieldPath } from './primitive.js'
import type { WhereBuilder } from './where-builder.js'

export type WhereLogicalKey = ReservedQueryLogicalFieldName

/** Describes one schema-correlated, transport-neutral filter object. */
export type WhereInput<TSchema extends SchemaTypeInfoSource> = SchemaTypeValue<
	TSchema,
	'Where'
>

type WhereFieldName<TSchema extends SchemaDefinition> = Exclude<
	Extract<keyof WhereInput<TSchema>, string>,
	WhereLogicalKey
>

type WhereFieldFilter<
	TSchema extends SchemaDefinition,
	TFieldName extends string,
> = TFieldName extends keyof WhereInput<TSchema>
	? NonNullable<WhereInput<TSchema>[TFieldName]>
	: unknown

export type WhereOperatorFieldName<
	TSchema extends SchemaDefinition,
	TOperator extends string,
> =
	string extends WhereFieldName<TSchema>
		? string
		: {
				[
					TFieldName in WhereFieldName<TSchema>
				]: TOperator extends keyof WhereFieldFilter<TSchema, TFieldName>
					? TFieldName
					: never
			}[WhereFieldName<TSchema>]

type WherePathEntry<
	TSchema extends SchemaDefinition,
	TFieldName extends WhereFieldName<TSchema>,
> =
	WhereFieldFilter<TSchema, TFieldName> extends {
		readonly at?: readonly (infer TEntry)[]
	}
		? TEntry
		: never

type WherePathTargetForEntry<
	TFieldName extends string,
	TOperator extends string,
	TEntry,
> = TEntry extends {
	readonly path: infer TPath extends readonly [string, ...string[]]
}
	? TOperator extends keyof TEntry
		? QueryFieldPath<TFieldName, TPath>
		: never
	: never

type WherePathTarget<
	TSchema extends SchemaDefinition,
	TOperator extends string,
> =
	string extends WhereFieldName<TSchema>
		? QueryFieldPath<string, readonly [string, ...string[]]>
		: {
				[TFieldName in WhereFieldName<TSchema>]: WherePathTargetForEntry<
					TFieldName,
					TOperator,
					WherePathEntry<TSchema, TFieldName>
				>
			}[WhereFieldName<TSchema>]

export type WhereBuilderTarget<
	TSchema extends SchemaDefinition,
	TOperator extends string,
> =
	| WhereOperatorFieldName<TSchema, TOperator>
	| WherePathTarget<TSchema, TOperator>

type WhereTargetFilter<TSchema extends SchemaDefinition, TTarget> =
	TTarget extends QueryFieldPath<
		infer TFieldName extends WhereFieldName<TSchema>,
		infer TPath
	>
		? Extract<WherePathEntry<TSchema, TFieldName>, { readonly path: TPath }>
		: TTarget extends WhereFieldName<TSchema>
			? WhereFieldFilter<TSchema, TTarget>
			: never

export type WhereBuilderOperand<
	TSchema extends SchemaDefinition,
	TOperator extends string,
	TTarget,
> =
	string extends WhereFieldName<TSchema>
		? unknown
		: TOperator extends keyof WhereTargetFilter<TSchema, TTarget>
			? Exclude<WhereTargetFilter<TSchema, TTarget>[TOperator], undefined>
			: unknown

export type WhereRangeBound<
	TSchema extends SchemaDefinition,
	TOperator extends 'between' | 'notBetween',
	TFieldName extends WhereOperatorFieldName<TSchema, TOperator>,
> =
	WhereBuilderOperand<TSchema, TOperator, TFieldName> extends {
		readonly lower: infer TLower
		readonly upper: infer TUpper
	}
		? TLower & TUpper
		: unknown

/** Builds one where object through the immutable utility class. */
export type WhereCallback<TSchema extends SchemaDefinition> = (
	builder: WhereBuilder<TSchema>,
) => WhereBuilder<TSchema>

/** Accepts direct, reusable, or callback-built forms of the same where contract. */
export type WhereSource<TSchema extends SchemaDefinition> =
	WhereBuilder<TSchema> | WhereInput<TSchema> | WhereCallback<TSchema>
