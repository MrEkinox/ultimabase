import type { InferCreateInput, SchemaDefinition } from '../../schema/index.js'

import type {
	ExactQuerySelection,
	LiteralQuerySelection,
	QuerySelection,
} from '../clauses/selection.js'
import type {
	WhereBuilder,
	WhereCallback,
	WhereInput,
} from '../filters/where.js'
import type { UpdateExpressionInput } from '../updates/contracts.js'

/** Exposes typed immutable filters without selection, ordering, or execution methods. */
export type SchemaWhere<TSchema extends SchemaDefinition> =
	WhereBuilder<TSchema>

/**
 * Builds one schema-aware mutation predicate.
 *
 * @example `{ id: { eq: postId } }`
 * @example `(where) => where.eq('published', false)`
 */
export type SchemaWhereFactory<TSchema extends SchemaDefinition> =
	WhereCallback<TSchema> | WhereInput<TSchema>

/** Requires an explicit opt-in before a set-based mutation targets every row. */
export type SchemaManyWhere<TSchema extends SchemaDefinition> =
	SchemaWhereFactory<TSchema> | 'all'

interface SchemaCreateOneFields<TSchema extends SchemaDefinition> {
	/** Supplies the schema-derived values for the new row. */
	readonly data: InferCreateInput<TSchema>
}

interface SchemaCreateManyFields<TSchema extends SchemaDefinition> {
	/** Supplies the ordered schema-derived values for the new rows. */
	readonly data: readonly InferCreateInput<TSchema>[]
}

type SchemaResultSelection<
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TSchema> | undefined,
> = [TSelection] extends [QuerySelection<TSchema>]
	? Readonly<{
			/** Projects returned models through the same flat contract as `Query.select`. */
			select: QuerySelection<TSchema> &
				ExactQuerySelection<TSchema, TSelection> &
				LiteralQuerySelection<TSelection>
		}>
	: Readonly<{ select?: never }>

/** Creates one row with an optional exact result projection. */
export type SchemaCreateOneInput<
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
> = SchemaCreateOneFields<TSchema> & SchemaResultSelection<TSchema, TSelection>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaCreateOneExecutionInput<TSchema extends SchemaDefinition> =
	SchemaCreateOneFields<TSchema> &
		Readonly<{ select?: QuerySelection<TSchema> }>

/** Creates ordered rows with one optional projection shared by every result. */
export type SchemaCreateManyInput<
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
> = SchemaCreateManyFields<TSchema> & SchemaResultSelection<TSchema, TSelection>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaCreateManyExecutionInput<TSchema extends SchemaDefinition> =
	SchemaCreateManyFields<TSchema> &
		Readonly<{ select?: QuerySelection<TSchema> }>

interface SchemaUpdateOneFields<TSchema extends SchemaDefinition> {
	/**
	 * Selects exactly one row by `id`, one unique field, or one complete unique index.
	 *
	 * @example `(where) => where.eq('id', postId)`
	 */
	readonly where: SchemaWhereFactory<TSchema>
	/**
	 * Applies typed atomic field operations when the target exists.
	 *
	 * @example `{ published: true, views: increment(1) }`
	 */
	readonly data: UpdateExpressionInput<TSchema> & {}
}

/** Updates one uniquely identified row with an optional exact result projection. */
export type SchemaUpdateOneInput<
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
> = SchemaUpdateOneFields<TSchema> & SchemaResultSelection<TSchema, TSelection>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaUpdateOneExecutionInput<TSchema extends SchemaDefinition> =
	SchemaUpdateOneFields<TSchema> &
		Readonly<{ select?: QuerySelection<TSchema> }>

interface SchemaUpdateManyFields<TSchema extends SchemaDefinition> {
	/** Selects matching rows, or targets every row only through the explicit `all` value. */
	readonly where: SchemaManyWhere<TSchema>
	/** Applies the same typed atomic expression to every matching row. */
	readonly data: UpdateExpressionInput<TSchema> & {}
}

/** Updates matching rows and returns their selected post-update values. */
export type SchemaUpdateManyInput<
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
> = SchemaUpdateManyFields<TSchema> & SchemaResultSelection<TSchema, TSelection>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaUpdateManyExecutionInput<TSchema extends SchemaDefinition> =
	SchemaUpdateManyFields<TSchema> &
		Readonly<{ select?: QuerySelection<TSchema> }>

interface SchemaDeleteOneFields<TSchema extends SchemaDefinition> {
	/** Selects exactly one row by `id`, one unique field, or one complete unique index. */
	readonly where: SchemaWhereFactory<TSchema>
}

/** Deletes one uniquely identified row with an optional exact result projection. */
export type SchemaDeleteOneInput<
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
> = SchemaDeleteOneFields<TSchema> & SchemaResultSelection<TSchema, TSelection>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaDeleteOneExecutionInput<TSchema extends SchemaDefinition> =
	SchemaDeleteOneFields<TSchema> &
		Readonly<{ select?: QuerySelection<TSchema> }>

interface SchemaDeleteManyFields<TSchema extends SchemaDefinition> {
	/** Selects matching rows, or targets every row only through the explicit `all` value. */
	readonly where: SchemaManyWhere<TSchema>
}

/** Deletes matching rows and returns their selected pre-delete values. */
export type SchemaDeleteManyInput<
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
> = SchemaDeleteManyFields<TSchema> & SchemaResultSelection<TSchema, TSelection>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaDeleteManyExecutionInput<TSchema extends SchemaDefinition> =
	SchemaDeleteManyFields<TSchema> &
		Readonly<{ select?: QuerySelection<TSchema> }>

interface SchemaUpsertFields<TSchema extends SchemaDefinition> {
	/** Selects the conflict target through `id` or one complete unique index. */
	readonly where: SchemaWhereFactory<TSchema>
	/** Supplies the complete create branch when no target exists. */
	readonly create: InferCreateInput<TSchema>
	/** Applies typed atomic operations when the target already exists. */
	readonly update: UpdateExpressionInput<TSchema> & {}
}

/** Creates one row or updates its unique target with an optional result projection. */
export type SchemaUpsertInput<
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
> = SchemaUpsertFields<TSchema> & SchemaResultSelection<TSchema, TSelection>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaUpsertExecutionInput<TSchema extends SchemaDefinition> =
	SchemaUpsertFields<TSchema> & Readonly<{ select?: QuerySelection<TSchema> }>

/** Describes one independently targeted item inside an ordered bulk upsert. */
export type SchemaUpsertManyItemInput<TSchema extends SchemaDefinition> =
	SchemaUpsertFields<TSchema>

interface SchemaUpsertManyFields<TSchema extends SchemaDefinition> {
	/** Supplies independently targeted items in deterministic declaration order. */
	readonly data: readonly SchemaUpsertManyItemInput<TSchema>[]
}

/** Upserts ordered items with one optional projection shared by every result. */
export type SchemaUpsertManyInput<
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
> = SchemaUpsertManyFields<TSchema> & SchemaResultSelection<TSchema, TSelection>

/** @internal Erases literal selection inference only at the execution boundary. */
export type SchemaUpsertManyExecutionInput<TSchema extends SchemaDefinition> =
	SchemaUpsertManyFields<TSchema> &
		Readonly<{ select?: QuerySelection<TSchema> }>
