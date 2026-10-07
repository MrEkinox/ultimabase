import type {
	SchemaDefinition,
	SchemaRelationshipTargetName,
} from '../../schema/index.js'
import type { QueryFieldName } from '../ast/contracts.js'
import type {
	QueryIncludableFieldName,
	QueryInclusionTargetSchema,
	QueryPointerFieldName,
} from '../clauses/inclusion.js'
import type {
	ExactQuerySelection,
	LiteralQuerySelection,
	QuerySelectedField,
	QuerySelection,
} from '../clauses/selection.js'
import type {
	QueryPointerResultInclusion,
	QueryRelationResultInclusion,
} from './result.js'
import type { QueryBuilder } from './query.js'

export type QuerySelectionAfterInclude<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedField extends QueryIncludableFieldName<TSchema>,
> =
	TIncludedField extends QueryPointerFieldName<TSchema>
		? [TSelectedField] extends [never]
			? never
			: TSelectedField | TIncludedField
		: TSelectedField

export type ReplaceResultInclusion<
	TIncludedPointer,
	TFieldName extends string,
	TNextInclusion,
> = Exclude<TIncludedPointer, { readonly field: TFieldName }> | TNextInclusion

export type QueryResultInclusionForField<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryIncludableFieldName<TSchema>,
	TTargetSelectedField extends QueryFieldName<
		QueryInclusionTargetSchema<TSchema, TFieldName>
	>,
	TTargetInclusion,
> =
	TFieldName extends QueryPointerFieldName<TSchema>
		? QueryPointerResultInclusion<
				TFieldName,
				QueryInclusionTargetSchema<TSchema, TFieldName>,
				TTargetSelectedField,
				TTargetInclusion
			>
		: QueryRelationResultInclusion<
				TFieldName,
				QueryInclusionTargetSchema<TSchema, TFieldName>,
				TTargetSelectedField,
				TTargetInclusion
			>

export type QueryInclusionTargetBuilder<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryIncludableFieldName<TSchema>,
> =
	string extends SchemaRelationshipTargetName<TSchema, TFieldName>
		? QueryBuilder<QueryInclusionTargetSchema<TSchema, TFieldName>>
		: TFieldName extends QueryPointerFieldName<TSchema>
			? QueryPointerTargetBuilder<
					QueryInclusionTargetSchema<TSchema, TFieldName>
				>
			: QueryBuilder<QueryInclusionTargetSchema<TSchema, TFieldName>>

export type QueryInclusionTargetResult<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryIncludableFieldName<TSchema>,
	TSelectedField extends QueryFieldName<
		QueryInclusionTargetSchema<TSchema, TFieldName>
	>,
	TIncludedField,
> =
	string extends SchemaRelationshipTargetName<TSchema, TFieldName>
		? QueryBuilder<
				QueryInclusionTargetSchema<TSchema, TFieldName>,
				TSelectedField,
				TIncludedField
			>
		: TFieldName extends QueryPointerFieldName<TSchema>
			? QueryPointerTargetBuilder<
					QueryInclusionTargetSchema<TSchema, TFieldName>,
					TSelectedField,
					TIncludedField
				>
			: QueryBuilder<
					QueryInclusionTargetSchema<TSchema, TFieldName>,
					TSelectedField,
					TIncludedField
				>

/**
 * Shapes one singular inclusion without exposing collection filtering clauses.
 *
 * A pointer already identifies at most one target. Its inclusion can project that
 * target or recursively include relationships, but it cannot conditionally filter it.
 */
export interface QueryPointerTargetBuilder<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedField = never,
> {
	/** Recursively shapes one relationship of the included pointer target. */
	include<
		const TFieldName extends QueryIncludableFieldName<TSchema>,
		TTargetSelectedField extends QueryFieldName<
			QueryInclusionTargetSchema<TSchema, TFieldName>
		>,
		TTargetIncludedField,
	>(
		fieldName: TFieldName,
		shape: (
			query: QueryInclusionTargetBuilder<TSchema, TFieldName>,
		) => QueryInclusionTargetResult<
			TSchema,
			TFieldName,
			TTargetSelectedField,
			TTargetIncludedField
		>,
	): QueryPointerTargetBuilder<
		TSchema,
		QuerySelectionAfterInclude<TSchema, TSelectedField, TFieldName>,
		ReplaceResultInclusion<
			TIncludedField,
			TFieldName,
			QueryResultInclusionForField<
				TSchema,
				TFieldName,
				TTargetSelectedField,
				TTargetIncludedField
			>
		>
	>

	/** Replaces the included pointer target's flat projection. */
	select<const TSelection extends QuerySelection<TSchema>>(
		selection: QuerySelection<TSchema> &
			ExactQuerySelection<TSchema, TSelection> &
			LiteralQuerySelection<TSelection>,
	): QueryPointerTargetBuilder<
		TSchema,
		QuerySelectedField<TSchema, TSelection>,
		TIncludedField
	>
}
