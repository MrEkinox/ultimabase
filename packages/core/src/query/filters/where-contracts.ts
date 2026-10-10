import type {
	SchemaDefinition,
	SchemaPointerFieldName,
	SchemaPointerTarget,
	SchemaRelationFieldName,
	SchemaRelationTarget,
	SchemaRulesTarget,
} from '../../schema/index.js'
import type {
	SchemaTypeInfoSource,
	SchemaTypeValue,
} from '../../schema/type-info.js'
import type { PointerValue } from '../../schema/relations/pointer.js'
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

/** Values of the equality shorthand (ADR-0307), which carry no operator. */
type WhereEqualityShorthand =
	bigint | boolean | number | PointerValue | string | Uint8Array

type WhereFieldFilter<
	TSchema extends SchemaDefinition,
	TFieldName extends string,
> = TFieldName extends keyof WhereInput<TSchema>
	? Exclude<
			NonNullable<WhereInput<TSchema>[TFieldName]>,
			WhereEqualityShorthand
		>
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
		? WherePathEntry<TSchema, TFieldName> extends infer TEntry
			? TEntry extends { readonly path: infer TAcceptedPath }
				? TPath extends TAcceptedPath
					? TEntry
					: never
				: never
			: never
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

/**
 * Builder schema of one relationship target: `SchemaRef<"User">` once the
 * application is registered (short hovers, name-keyed contract), else the
 * target schema itself. Applied only in builder parameters, a lazy position,
 * never while a schema is declared (ADR-0297).
 */
type RelationshipFilterTarget<TTarget extends SchemaDefinition> = Extract<
	SchemaRulesTarget<TTarget>,
	SchemaDefinition
>

/** Accepts one filter of the target of a relation field. */
export type WhereRelationSource<
	TSchema extends SchemaDefinition,
	TFieldName extends SchemaRelationFieldName<TSchema>,
> = WhereSource<
	RelationshipFilterTarget<SchemaRelationTarget<TSchema, TFieldName>>
>

/** Accepts one filter of the target of a pointer field. */
export type WherePointerSource<
	TSchema extends SchemaDefinition,
	TFieldName extends SchemaPointerFieldName<TSchema>,
> = WhereSource<
	RelationshipFilterTarget<SchemaPointerTarget<TSchema, TFieldName>>
>
