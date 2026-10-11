import type {
	SchemaCreateData,
	SchemaDefinition,
	SchemaNestedCreateData,
} from '../../schema/index.js'
import type {
	SchemaTypeInfoFor,
	SchemaTypeInfoSource,
} from '../../schema/type-info.js'

import type {
	ExactQuerySelection,
	LiteralQuerySelection,
	QuerySelection,
} from '../clauses/selection.js'
import type { WhereBuilder, WhereInput } from '../filters/where.js'
import type {
	NestedUpdateExpressionInput,
	UpdateExpressionInput,
} from '../updates/contracts.js'
import type {
	ExactGeneratedInclusionInput,
	FitsQueryProjection,
} from '../query/input.js'

/** Exposes typed immutable filters without selection, ordering, or execution methods. */
export type SchemaWhere<TSchema extends SchemaDefinition> =
	WhereBuilder<TSchema>

/**
 * Describes one canonical schema-aware mutation predicate.
 *
 * @example `{ id: postId }`
 */
export type SchemaWhereInput<TSchema extends SchemaTypeInfoSource> =
	WhereInput<TSchema>

interface SchemaCreateOneFields<TSchema extends SchemaTypeInfoSource> {
	/** Supplies the schema-derived values for the new row. */
	readonly data: SchemaNestedCreateData<TSchema>
}

interface SchemaCreateManyFields<TSchema extends SchemaTypeInfoSource> {
	/** Supplies the ordered schema-derived values for the new rows. */
	readonly data: readonly SchemaCreateData<TSchema>[]
}

type SchemaIncludeContract<TSchema extends SchemaTypeInfoSource> = NonNullable<
	SchemaTypeInfoFor<TSchema>['inputs']['include']
>

type SchemaResultProjection<
	TSchema extends SchemaTypeInfoSource,
	TSelection,
	TInclude,
> = SchemaResultSelection<TSchema, TSelection> &
	(string extends SchemaTypeInfoFor<TSchema>['fields']
		? Readonly<{
				readonly include?: SchemaTypeInfoFor<TSchema>['inputs']['include']
			}>
		: FitsQueryProjection<
					TInclude,
					SchemaIncludeContract<TSchema>
			  > extends false
			? Readonly<{ readonly include?: SchemaIncludeContract<TSchema> }>
			: ExactGeneratedInclusionInput<
					TSchema,
					Extract<TInclude, SchemaIncludeContract<TSchema> | undefined>
				> &
					Readonly<{ readonly include?: TInclude }>)

// A selection that does not fit the schema is checked against the selection
// contract alone, so a misspelled field is reported by name (ADR-0315).
type SchemaResultSelection<TSchema extends SchemaTypeInfoSource, TSelection> =
	FitsQueryProjection<TSelection, QuerySelection<TSchema>> extends false
		? Readonly<{
				/** Projects returned models through the same flat contract as `QueryBuilder.select`. */
				readonly select?: QuerySelection<TSchema>
			}>
		: Readonly<{
				/** Projects returned models through the same flat contract as `QueryBuilder.select`. */
				readonly select?: TSelection &
					QuerySelection<TSchema> &
					ExactQuerySelection<TSchema, TSelection> &
					LiteralQuerySelection<TSelection>
			}>

/** Creates one row with an optional exact result projection. */
export type SchemaCreateOneInput<
	TSchema extends SchemaTypeInfoSource,
	TSelection = undefined,
	TInclude = undefined,
> = SchemaCreateOneFields<TSchema> &
	SchemaResultProjection<TSchema, TSelection, TInclude>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaCreateOneExecutionInput<
	TSchema extends SchemaTypeInfoSource,
> = SchemaCreateOneFields<TSchema> &
	Readonly<{
		include?: SchemaTypeInfoFor<TSchema>['inputs']['include']
		select?: QuerySelection<TSchema>
	}>

/** Creates ordered rows with one optional projection shared by every result. */
export type SchemaCreateManyInput<
	TSchema extends SchemaTypeInfoSource,
	TSelection = undefined,
	TInclude = undefined,
> = SchemaCreateManyFields<TSchema> &
	SchemaResultProjection<TSchema, TSelection, TInclude>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaCreateManyExecutionInput<
	TSchema extends SchemaTypeInfoSource,
> = SchemaCreateManyFields<TSchema> &
	Readonly<{
		include?: SchemaTypeInfoFor<TSchema>['inputs']['include']
		select?: QuerySelection<TSchema>
	}>

type SchemaSingularTarget<TSchema extends SchemaTypeInfoSource> = Readonly<{
	/**
	 * Selects exactly one row by `id`, one unique field, or one complete unique index.
	 *
	 * @example `{ id: postId }`
	 */
	readonly where: SchemaWhereInput<TSchema>
}>

interface SchemaUpdateFields<TSchema extends SchemaTypeInfoSource> {
	/**
	 * Applies typed atomic field operations when the target exists.
	 *
	 * @example `{ published: true, views: { increment: 1 } }`
	 */
	readonly data: UpdateExpressionInput<TSchema> & {}
}

interface SchemaNestedUpdateFields<TSchema extends SchemaTypeInfoSource> {
	/** Applies scalar operators and nested relationship commands to one target. */
	readonly data: NestedUpdateExpressionInput<TSchema> & {}
}

type SchemaUpdateOneFields<TSchema extends SchemaTypeInfoSource> =
	SchemaNestedUpdateFields<TSchema> & SchemaSingularTarget<TSchema>

/** Updates one uniquely identified row with an optional exact result projection. */
export type SchemaUpdateOneInput<
	TSchema extends SchemaTypeInfoSource,
	TSelection = undefined,
	TInclude = undefined,
> = SchemaUpdateOneFields<TSchema> &
	SchemaResultProjection<TSchema, TSelection, TInclude>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaUpdateOneExecutionInput<
	TSchema extends SchemaTypeInfoSource,
> = SchemaUpdateOneFields<TSchema> &
	Readonly<{
		include?: SchemaTypeInfoFor<TSchema>['inputs']['include']
		select?: QuerySelection<TSchema>
	}>

/** Describes one independently targeted update inside an ordered atomic batch. */
export type SchemaUpdateManyItemInput<TSchema extends SchemaTypeInfoSource> =
	SchemaUpdateFields<TSchema> &
		Readonly<{
			/** Selects one exact unique target inside the batch. */
			readonly where: SchemaWhereInput<TSchema>
		}>

interface SchemaUpdateManyFields<TSchema extends SchemaTypeInfoSource> {
	/** Supplies uniquely targeted updates in deterministic declaration order. */
	readonly data: readonly SchemaUpdateManyItemInput<TSchema>[]
}

/** Updates uniquely targeted rows in order and returns their selected values. */
export type SchemaUpdateManyInput<
	TSchema extends SchemaTypeInfoSource,
	TSelection = undefined,
	TInclude = undefined,
> = SchemaUpdateManyFields<TSchema> &
	SchemaResultProjection<TSchema, TSelection, TInclude>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaUpdateManyExecutionInput<
	TSchema extends SchemaTypeInfoSource,
> = SchemaUpdateManyFields<TSchema> &
	Readonly<{
		include?: SchemaTypeInfoFor<TSchema>['inputs']['include']
		select?: QuerySelection<TSchema>
	}>

type SchemaDeleteOneFields<TSchema extends SchemaTypeInfoSource> =
	SchemaSingularTarget<TSchema>

/** Deletes one uniquely identified row with an optional exact result projection. */
export type SchemaDeleteOneInput<
	TSchema extends SchemaTypeInfoSource,
	TSelection = undefined,
> = SchemaDeleteOneFields<TSchema> & SchemaResultSelection<TSchema, TSelection>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaDeleteOneExecutionInput<
	TSchema extends SchemaTypeInfoSource,
> = SchemaDeleteOneFields<TSchema> &
	Readonly<{ select?: QuerySelection<TSchema> }>

interface SchemaDeleteManyFields<TSchema extends SchemaTypeInfoSource> {
	/** Supplies unique targets in deterministic declaration order. */
	readonly where: readonly SchemaWhereInput<TSchema>[]
}

/** Deletes uniquely targeted rows in order and returns their selected values. */
export type SchemaDeleteManyInput<
	TSchema extends SchemaTypeInfoSource,
	TSelection = undefined,
> = SchemaDeleteManyFields<TSchema> & SchemaResultSelection<TSchema, TSelection>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaDeleteManyExecutionInput<
	TSchema extends SchemaTypeInfoSource,
> = SchemaDeleteManyFields<TSchema> &
	Readonly<{ select?: QuerySelection<TSchema> }>

interface SchemaUpsertOneFields<TSchema extends SchemaTypeInfoSource> {
	/** Selects the conflict target through `id` or one complete unique index. */
	readonly where: SchemaWhereInput<TSchema>
	/** Supplies the complete create branch when no target exists. */
	readonly create: SchemaCreateData<TSchema>
	/** Applies typed atomic operations when the target already exists. */
	readonly update: UpdateExpressionInput<TSchema> & {}
}

/** Creates one row or updates its unique target with an optional result projection. */
export type SchemaUpsertOneInput<
	TSchema extends SchemaTypeInfoSource,
	TSelection = undefined,
> = SchemaUpsertOneFields<TSchema> & SchemaResultSelection<TSchema, TSelection>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaUpsertOneExecutionInput<
	TSchema extends SchemaTypeInfoSource,
> = SchemaUpsertOneFields<TSchema> &
	Readonly<{ select?: QuerySelection<TSchema> }>

/** Describes one independently targeted item inside an ordered bulk upsert. */
export type SchemaUpsertManyItemInput<TSchema extends SchemaTypeInfoSource> =
	SchemaUpsertOneFields<TSchema>

interface SchemaUpsertManyFields<TSchema extends SchemaTypeInfoSource> {
	/** Supplies independently targeted items in deterministic declaration order. */
	readonly data: readonly SchemaUpsertManyItemInput<TSchema>[]
}

/** Upserts ordered items with one optional projection shared by every result. */
export type SchemaUpsertManyInput<
	TSchema extends SchemaTypeInfoSource,
	TSelection = undefined,
> = SchemaUpsertManyFields<TSchema> & SchemaResultSelection<TSchema, TSelection>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaUpsertManyExecutionInput<
	TSchema extends SchemaTypeInfoSource,
> = SchemaUpsertManyFields<TSchema> &
	Readonly<{ select?: QuerySelection<TSchema> }>
