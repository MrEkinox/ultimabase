import type {
	InferObject,
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
	readonly field: TFieldName
	readonly target: TTargetSchema
	readonly selected: TSelectedField
	readonly nested: TNestedInclusion
}

type IncludedPointerForField<TInclusion, TFieldName> = TInclusion extends {
	readonly field: TFieldName
}
	? TInclusion
	: never

type MaterializeIncludedPointer<TValue, TInclusion> =
	TInclusion extends QueryPointerResultInclusion<
		string,
		infer TTargetSchema,
		infer TSelectedField,
		infer TNestedInclusion
	>
		? TValue extends Pointer<TTargetSchema>
			? InferQueryResult<TTargetSchema, TSelectedField, TNestedInclusion>
			: TValue
		: TValue

type ApplyPointerInclusions<TRecord, TInclusion> = {
	[TFieldName in keyof TRecord]: MaterializeIncludedPointer<
		TRecord[TFieldName],
		IncludedPointerForField<TInclusion, TFieldName>
	>
}

/** Computes the base projection before included pointers replace identities. */
type SelectedQueryRecord<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
> = [TSelectedField] extends [never]
	? InferObject<TSchema>
	: Simplify<
			Pick<
				InferObject<TSchema>,
				Extract<TSelectedField, keyof InferObject<TSchema>>
			>
		>

/** Infers one neutral persisted record or its exact selected projection. */
export type InferQueryRecord<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedPointer = never,
> = [TIncludedPointer] extends [never]
	? SelectedQueryRecord<TSchema, TSelectedField>
	: Simplify<
			ApplyPointerInclusions<
				SelectedQueryRecord<TSchema, TSelectedField>,
				TIncludedPointer
			>
		>

/** Infers one schema-class result with only its statically visible fields. */
export type InferQueryResult<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedPointer = never,
> = Simplify<
	SchemaResult<
		TSchema,
		InferQueryRecord<TSchema, TSelectedField, TIncludedPointer>
	>
>
