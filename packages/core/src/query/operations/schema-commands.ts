import type { InferCreateInput, SchemaDefinition } from '../../schema/index.js'

import type { RelationPredicate } from '../filters/relation.js'
import type { UpdateExpressionInput } from '../updates/contracts.js'

/** Exposes typed immutable filters without selection, ordering, or execution methods. */
export type SchemaWhere<TSchema extends SchemaDefinition> =
	RelationPredicate<TSchema>

/**
 * Builds one schema-aware mutation predicate.
 *
 * @example `(where) => where.byId(postId)`
 * @example `(where) => where.equalTo('published', false)`
 */
export type SchemaWhereFactory<TSchema extends SchemaDefinition> = (
	where: SchemaWhere<TSchema>,
) => SchemaWhere<TSchema>

/** Requires an explicit opt-in before a set-based mutation targets every row. */
export type SchemaManyWhere<TSchema extends SchemaDefinition> =
	SchemaWhereFactory<TSchema> | 'all'

/** Updates one uniquely identified row through an atomic expression. */
export interface SchemaUpdateOneInput<TSchema extends SchemaDefinition> {
	/**
	 * Selects exactly one row by `id`, one unique field, or one complete unique index.
	 *
	 * @example `(where) => where.byId(postId)`
	 */
	readonly where: SchemaWhereFactory<TSchema>
	/**
	 * Applies typed atomic field operations when the target exists.
	 *
	 * @example `{ published: true, views: increment(1) }`
	 */
	readonly data: UpdateExpressionInput<TSchema> & {}
}

/** Updates every matching row, or every row only through the explicit `all` value. */
export interface SchemaUpdateManyInput<TSchema extends SchemaDefinition> {
	/** Selects matching rows, or targets every row only through the explicit `all` value. */
	readonly where: SchemaManyWhere<TSchema>
	/** Applies the same typed atomic expression to every matching row. */
	readonly data: UpdateExpressionInput<TSchema> & {}
}

/** Deletes one row selected by an exact unique target. */
export interface SchemaDeleteOneInput<TSchema extends SchemaDefinition> {
	/** Selects exactly one row by `id`, one unique field, or one complete unique index. */
	readonly where: SchemaWhereFactory<TSchema>
}

/** Deletes every matching row, or every row only through the explicit `all` value. */
export interface SchemaDeleteManyInput<TSchema extends SchemaDefinition> {
	/** Selects matching rows, or targets every row only through the explicit `all` value. */
	readonly where: SchemaManyWhere<TSchema>
}

/** Creates one row or updates the row selected by an exact unique target. */
export interface SchemaUpsertInput<TSchema extends SchemaDefinition> {
	/** Selects the conflict target through `id` or one complete unique index. */
	readonly where: SchemaWhereFactory<TSchema>
	/** Supplies the complete create branch when no target exists. */
	readonly create: InferCreateInput<TSchema>
	/** Applies typed atomic operations when the target already exists. */
	readonly update: UpdateExpressionInput<TSchema> & {}
}

/** Describes one independently targeted item inside an ordered bulk upsert. */
export type SchemaUpsertManyItemInput<TSchema extends SchemaDefinition> =
	SchemaUpsertInput<TSchema>
