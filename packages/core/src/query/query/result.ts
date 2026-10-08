import type {
	SchemaOutput,
	SchemaDefinition,
	SchemaResult,
} from '../../schema/index.js'
import type { Pointer } from '../../schema/relations/pointer.js'

import type { QueryFieldName } from '../ast/contracts.js'

/** Materializes one projection so editor QuickInfo hides the complete source object. */
type Simplify<TValue> = {
	[TKey in keyof TValue]: TValue[TKey]
} & {}

/** Retains one included pointer's exact target projection only at type level. */
export interface QueryPointerResultInclusion<
	TFieldName extends string,
	TTargetSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TTargetSchema>,
	TNestedInclusion = never,
> {
	readonly kind: 'pointer'
	readonly field: TFieldName
	readonly target: TTargetSchema
	readonly selected: TSelectedField
	readonly nested: TNestedInclusion
}

/** Retains one included relation's exact target collection only at type level. */
export interface QueryRelationResultInclusion<
	TFieldName extends string,
	TTargetSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TTargetSchema>,
	TNestedInclusion = never,
> {
	readonly kind: 'relation'
	readonly field: TFieldName
	readonly target: TTargetSchema
	readonly selected: TSelectedField
	readonly nested: TNestedInclusion
}

/** Enumerates the exact hydrated values contributed by one query include tree. */
export type QueryResultInclusion =
	| QueryPointerResultInclusion<
			string,
			SchemaDefinition,
			QueryFieldName<SchemaDefinition>,
			unknown
	  >
	| QueryRelationResultInclusion<
			string,
			SchemaDefinition,
			QueryFieldName<SchemaDefinition>,
			unknown
	  >

type IncludedPointerForField<TInclusion, TFieldName> = TInclusion extends {
	readonly field: TFieldName
}
	? TInclusion
	: never

// A field without an inclusion keeps its value: a bare conditional over `never`
// would distribute to `never` and erase every non-included field.
type MaterializeIncludedPointer<TValue, TInclusion> = [TInclusion] extends [
	never,
]
	? TValue
	: TInclusion extends QueryPointerResultInclusion<
				string,
				infer TTargetSchema,
				infer TSelectedField,
				infer TNestedInclusion
		  >
		? TValue extends Pointer<TTargetSchema>
			? QueryResult<TTargetSchema, TSelectedField, TNestedInclusion> | null
			: TValue
		: TValue

type MaterializeIncludedRelation<TInclusion> =
	TInclusion extends QueryRelationResultInclusion<
		infer TFieldName,
		infer TTargetSchema,
		infer TSelectedField,
		infer TNestedInclusion
	>
		? Readonly<
				Record<
					TFieldName,
					readonly QueryResult<
						TTargetSchema,
						TSelectedField,
						TNestedInclusion
					>[]
				>
			>
		: never

type UnionToIntersection<TValue> = (
	TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
	? TIntersection
	: unknown

type IncludedPointerFieldName<TInclusion> = TInclusion extends {
	readonly kind: 'pointer'
	readonly field: infer TFieldName
}
	? TFieldName
	: never

// The Runtime returns an included pointer even when `select` omits it, so the
// projection gains every included pointer field from the complete output.
type ApplyPointerInclusions<TRecord, TOutput, TInclusion> = {
	readonly [
		TFieldName in
			| keyof TRecord
			| Extract<IncludedPointerFieldName<TInclusion>, keyof TOutput>
	]: MaterializeIncludedPointer<
		TFieldName extends keyof TRecord
			? TRecord[TFieldName]
			: TFieldName extends keyof TOutput
				? TOutput[TFieldName]
				: never,
		IncludedPointerForField<TInclusion, TFieldName>
	>
}

type ApplyInclusions<TRecord, TOutput, TInclusion> = Simplify<
	ApplyPointerInclusions<TRecord, TOutput, TInclusion> &
		UnionToIntersection<MaterializeIncludedRelation<TInclusion>>
>

/** Computes the base projection before included pointers replace identities. */
type SelectedQueryRecord<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
> = [TSelectedField] extends [never]
	? SchemaOutput<TSchema>
	: Simplify<
			Pick<
				SchemaOutput<TSchema>,
				Extract<TSelectedField | 'id', keyof SchemaOutput<TSchema>>
			>
		>

/** Infers one neutral public output record or its exact selected projection. */
export type QueryRecord<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedPointer = never,
> =
	string extends QueryFieldName<TSchema>
		? Readonly<Record<string, unknown>>
		: [TIncludedPointer] extends [never]
			? SelectedQueryRecord<TSchema, TSelectedField>
			: ApplyInclusions<
					SelectedQueryRecord<TSchema, TSelectedField>,
					SchemaOutput<TSchema>,
					TIncludedPointer
				>

/** Infers one schema-class result with only its statically visible fields. */
export type QueryResult<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedPointer = never,
> =
	string extends QueryFieldName<TSchema>
		? Simplify<SchemaResult<TSchema, SchemaOutput<TSchema>>>
		: Simplify<
				SchemaResult<
					TSchema,
					QueryRecord<TSchema, TSelectedField, TIncludedPointer>
				>
			>
