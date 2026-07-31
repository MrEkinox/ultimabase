import type { InferObject, SchemaDefinition } from '@ultimabase/schema'
import type { QueryAst, QueryFieldName } from '../ast/contracts.js'
import type { QueryFilterNode } from '../filters/logical.js'
import type {
	QueryFilterFieldName,
	QueryFilterValue,
	QueryRegexPattern,
} from '../filters/primitive.js'
import type { Query } from './query.js'

type QueryComparisonValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Exclude<QueryFilterValue<TSchema, TFieldName>, null>

type QueryStringValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Extract<QueryFilterValue<TSchema, TFieldName>, string>

/** Infers the exact object projection returned by future read terminals. */
export type InferQueryResult<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
> = [TSelectedField] extends [never]
	? InferObject<TSchema>
	: Pick<
			InferObject<TSchema>,
			Extract<TSelectedField, keyof InferObject<TSchema>>
		>

/** Retains one Runtime-owned execution binding across immutable query branches. */
export class BoundQuery<
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TEngine extends object = object,
> {
	readonly #engine: TEngine
	readonly #query: Query<TSchema, TSelectedField>

	constructor(query: Query<TSchema, TSelectedField>, engine: TEngine) {
		this.#query = query
		this.#engine = engine

		// A bound branch cannot acquire mutable execution or query state later.
		Object.freeze(this)
	}

	/** Exposes the exact engine retained for future terminal execution. */
	get engine(): TEngine {
		return this.#engine
	}

	/** Exposes the reusable unbound query without copying its immutable AST. */
	get unbound(): Query<TSchema, TSelectedField> {
		return this.#query
	}

	/** Exposes the shared transport-neutral representation. */
	get ast(): QueryAst<TSchema, QueryFilterNode<TSchema>> {
		return this.#query.ast
	}

	/** Returns the exact schema retained by the underlying query. */
	get schema(): TSchema {
		return this.#query.schema
	}

	/** Adds selected fields while preserving the Runtime binding. */
	select<const TField extends readonly QueryFieldName<TSchema>[]>(
		...fields: TField
	): BoundQuery<TSchema, TSelectedField | TField[number], TEngine> {
		return this.#branch(this.#query.select(...fields))
	}

	/** Appends ascending order terms on a new bound branch. */
	ascending(
		...fields: readonly QueryFieldName<TSchema>[]
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.ascending(...fields))
	}

	/** Appends descending order terms on a new bound branch. */
	descending(
		...fields: readonly QueryFieldName<TSchema>[]
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.descending(...fields))
	}

	/** Defines the page size on a new bound branch. */
	limit(value: number): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.limit(value))
	}

	/** Selects offset pagination on a new bound branch. */
	skip(value: number): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.skip(value))
	}

	/** Selects cursor pagination on a new bound branch. */
	after(cursor: string): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.after(cursor))
	}

	/** Adds an equality condition on a new bound branch. */
	equalTo<TFieldName extends QueryFilterFieldName<TSchema, 'equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.equalTo(fieldName, value))
	}

	/** Adds an inequality condition on a new bound branch. */
	notEqualTo<TFieldName extends QueryFilterFieldName<TSchema, 'not-equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.notEqualTo(fieldName, value))
	}

	/** Adds a strict lower comparison on a new bound branch. */
	greaterThan<TFieldName extends QueryFilterFieldName<TSchema, 'greater-than'>>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.greaterThan(fieldName, value))
	}

	/** Adds an inclusive lower comparison on a new bound branch. */
	greaterThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'greater-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.greaterThanOrEqualTo(fieldName, value))
	}

	/** Adds a strict upper comparison on a new bound branch. */
	lessThan<TFieldName extends QueryFilterFieldName<TSchema, 'less-than'>>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.lessThan(fieldName, value))
	}

	/** Adds an inclusive upper comparison on a new bound branch. */
	lessThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'less-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.lessThanOrEqualTo(fieldName, value))
	}

	/** Adds an inclusion condition on a new bound branch. */
	containedIn<TFieldName extends QueryFilterFieldName<TSchema, 'in'>>(
		fieldName: TFieldName,
		values: readonly QueryFilterValue<TSchema, TFieldName>[],
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.containedIn(fieldName, values))
	}

	/** Adds an exclusion condition on a new bound branch. */
	notContainedIn<TFieldName extends QueryFilterFieldName<TSchema, 'not-in'>>(
		fieldName: TFieldName,
		values: readonly QueryFilterValue<TSchema, TFieldName>[],
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.notContainedIn(fieldName, values))
	}

	/** Adds a substring condition on a new bound branch. */
	contains<TFieldName extends QueryFilterFieldName<TSchema, 'contains'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.contains(fieldName, value))
	}

	/** Adds a prefix condition on a new bound branch. */
	startsWith<TFieldName extends QueryFilterFieldName<TSchema, 'starts-with'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.startsWith(fieldName, value))
	}

	/** Adds a suffix condition on a new bound branch. */
	endsWith<TFieldName extends QueryFilterFieldName<TSchema, 'ends-with'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.endsWith(fieldName, value))
	}

	/** Adds an inert regular-expression condition on a new bound branch. */
	matches(
		fieldName: QueryFilterFieldName<TSchema, 'regex'>,
		pattern: QueryRegexPattern,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.matches(fieldName, pattern))
	}

	/** Adds a positive field-presence condition on a new bound branch. */
	exists(
		fieldName: QueryFilterFieldName<TSchema, 'exists'>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.exists(fieldName))
	}

	/** Adds a negative field-presence condition on a new bound branch. */
	doesNotExist(
		fieldName: QueryFilterFieldName<TSchema, 'exists'>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.doesNotExist(fieldName))
	}

	/** Combines a reusable query filter through AND without changing this selection. */
	and<TOtherSelection extends QueryFieldName<TSchema>>(
		query: Query<TSchema, TOtherSelection>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.and(query))
	}

	/** Combines a reusable query filter through OR without changing this selection. */
	or<TOtherSelection extends QueryFieldName<TSchema>>(
		query: Query<TSchema, TOtherSelection>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.or(query))
	}

	/** Negates a reusable query filter without changing this selection. */
	not<TOtherSelection extends QueryFieldName<TSchema>>(
		query: Query<TSchema, TOtherSelection>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.not(query))
	}

	#branch<TNextSelection extends QueryFieldName<TSchema>>(
		query: Query<TSchema, TNextSelection>,
	): BoundQuery<TSchema, TNextSelection, TEngine> {
		return new BoundQuery(query, this.#engine)
	}
}
