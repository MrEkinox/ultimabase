import type { SchemaDefinition } from '@ultimabase/schema'
import { immutableRecord } from '@ultimabase/shared'

import type {
	QueryAst,
	QueryFieldName,
	QueryOrderDirection,
	QueryWhereNode,
} from '../ast/contracts.js'
import { createQueryAst } from '../ast/factory.js'
import { normalizeQueryOrdering } from '../clauses/ordering.js'
import {
	normalizeQueryCursorPagination,
	normalizeQueryLimit,
	normalizeQueryOffsetPagination,
} from '../clauses/pagination.js'
import { normalizeQuerySelection } from '../clauses/selection.js'
import {
	createQueryExistenceFilter,
	createQueryMembershipFilter,
	createQueryRegexFilter,
	createQueryValueFilter,
} from '../filters/factory.js'
import {
	normalizeLogicalFilter,
	type QueryFilterNode,
} from '../filters/logical.js'
import type {
	QueryFilterFieldName,
	QueryFilterValue,
	QueryPrimitiveFilterNode,
	QueryRegexPattern,
} from '../filters/primitive.js'

type QueryBuilderAst<TSchema extends SchemaDefinition> = QueryAst<
	TSchema,
	QueryFilterNode<TSchema>
>

type QueryAstPatch<TSchema extends SchemaDefinition> = Partial<
	Pick<
		QueryBuilderAst<TSchema>,
		'limit' | 'ordering' | 'pagination' | 'selection' | 'where'
	>
>

type QueryComparisonValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Exclude<QueryFilterValue<TSchema, TFieldName>, null>

type QueryStringValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Extract<QueryFilterValue<TSchema, TFieldName>, string>

/**
 * Builds one immutable transport-neutral query without binding execution state.
 */
export class Query<const TSchema extends SchemaDefinition> {
	#ast: QueryBuilderAst<TSchema>

	constructor(schema: TSchema) {
		this.#ast = createQueryAst(schema)

		// Public instances cannot acquire mutable ad-hoc state between branches.
		Object.freeze(this)
	}

	/** Exposes the immutable representation consumed by transports and Runtime. */
	get ast(): QueryBuilderAst<TSchema> {
		return this.#ast
	}

	/** Returns the exact schema retained by the Query AST. */
	get schema(): TSchema {
		return this.#ast.schema.definition
	}

	/** Adds selected fields while keeping their first declaration order. */
	select(...fields: readonly QueryFieldName<TSchema>[]): Query<TSchema> {
		const selectedFields = this.#ast.selection.fields.map(
			(selection) => selection.field,
		)

		return this.#with({
			selection: normalizeQuerySelection(this.schema, [
				...selectedFields,
				...fields,
			]),
		})
	}

	/** Appends ascending order terms without mutating earlier query branches. */
	ascending(...fields: readonly QueryFieldName<TSchema>[]): Query<TSchema> {
		return this.#order('ascending', fields)
	}

	/** Appends descending order terms without mutating earlier query branches. */
	descending(...fields: readonly QueryFieldName<TSchema>[]): Query<TSchema> {
		return this.#order('descending', fields)
	}

	/** Defines the single page-size clause shared by all pagination strategies. */
	limit(value: number): Query<TSchema> {
		return this.#with({ limit: normalizeQueryLimit(value) })
	}

	/** Selects offset pagination and rejects an existing cursor position. */
	skip(value: number): Query<TSchema> {
		const pagination = normalizeQueryOffsetPagination({ skip: value })

		if (pagination === undefined) {
			// Zero removes an existing offset while leaving an unrelated cursor branch intact.
			return this.#ast.pagination?.kind === 'offset-pagination'
				? this.#with({ pagination: undefined })
				: this.#with({})
		}

		if (this.#ast.pagination?.kind === 'cursor-pagination') {
			throw new TypeError('query cannot combine skip and after pagination')
		}

		return this.#with({ pagination })
	}

	/** Selects forward cursor pagination and rejects an existing offset. */
	after(cursor: string): Query<TSchema> {
		if (this.#ast.pagination?.kind === 'offset-pagination') {
			throw new TypeError('query cannot combine skip and after pagination')
		}

		return this.#with({
			pagination: normalizeQueryCursorPagination({ after: cursor }),
		})
	}

	/** Adds an equality condition to the implicit AND filter chain. */
	equalTo<TFieldName extends QueryFilterFieldName<TSchema, 'equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'equal', fieldName, value),
		)
	}

	/** Adds an inequality condition to the implicit AND filter chain. */
	notEqualTo<TFieldName extends QueryFilterFieldName<TSchema, 'not-equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'not-equal', fieldName, value),
		)
	}

	/** Adds a strict greater-than comparison to the implicit AND filter chain. */
	greaterThan<TFieldName extends QueryFilterFieldName<TSchema, 'greater-than'>>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'greater-than', fieldName, value),
		)
	}

	/** Adds an inclusive lower bound to the implicit AND filter chain. */
	greaterThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'greater-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryValueFilter(
				this.schema,
				'greater-than-or-equal',
				fieldName,
				value,
			),
		)
	}

	/** Adds a strict less-than comparison to the implicit AND filter chain. */
	lessThan<TFieldName extends QueryFilterFieldName<TSchema, 'less-than'>>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'less-than', fieldName, value),
		)
	}

	/** Adds an inclusive upper bound to the implicit AND filter chain. */
	lessThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'less-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryValueFilter(
				this.schema,
				'less-than-or-equal',
				fieldName,
				value,
			),
		)
	}

	/** Adds an inclusion condition from a caller-owned candidate collection. */
	containedIn<TFieldName extends QueryFilterFieldName<TSchema, 'in'>>(
		fieldName: TFieldName,
		values: readonly QueryFilterValue<TSchema, TFieldName>[],
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryMembershipFilter(this.schema, 'in', fieldName, values),
		)
	}

	/** Adds an exclusion condition from a caller-owned candidate collection. */
	notContainedIn<TFieldName extends QueryFilterFieldName<TSchema, 'not-in'>>(
		fieldName: TFieldName,
		values: readonly QueryFilterValue<TSchema, TFieldName>[],
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryMembershipFilter(this.schema, 'not-in', fieldName, values),
		)
	}

	/** Adds a portable substring condition for a scalar string field. */
	contains<TFieldName extends QueryFilterFieldName<TSchema, 'contains'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'contains', fieldName, value),
		)
	}

	/** Adds a portable prefix condition for a scalar string field. */
	startsWith<TFieldName extends QueryFilterFieldName<TSchema, 'starts-with'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'starts-with', fieldName, value),
		)
	}

	/** Adds a portable suffix condition for a scalar string field. */
	endsWith<TFieldName extends QueryFilterFieldName<TSchema, 'ends-with'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'ends-with', fieldName, value),
		)
	}

	/** Adds a declarative regular-expression condition without executable state. */
	matches(
		fieldName: QueryFilterFieldName<TSchema, 'regex'>,
		pattern: QueryRegexPattern,
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryRegexFilter(this.schema, fieldName, pattern),
		)
	}

	/** Adds a positive field-presence condition. */
	exists(fieldName: QueryFilterFieldName<TSchema, 'exists'>): Query<TSchema> {
		return this.#appendFilter(
			createQueryExistenceFilter(this.schema, fieldName, true),
		)
	}

	/** Adds a negative field-presence condition. */
	doesNotExist(
		fieldName: QueryFilterFieldName<TSchema, 'exists'>,
	): Query<TSchema> {
		return this.#appendFilter(
			createQueryExistenceFilter(this.schema, fieldName, false),
		)
	}

	/** Combines the other query's filter with this query through AND. */
	and(query: Query<TSchema>): Query<TSchema> {
		return this.#combine(query, 'and', false)
	}

	/** Combines the other query's filter with this query through OR. */
	or(query: Query<TSchema>): Query<TSchema> {
		return this.#combine(query, 'or', false)
	}

	/** Adds the negation of the other query's filter through the implicit AND. */
	not(query: Query<TSchema>): Query<TSchema> {
		return this.#combine(query, 'and', true)
	}

	#order(
		direction: QueryOrderDirection,
		fields: readonly QueryFieldName<TSchema>[],
	): Query<TSchema> {
		const orders = this.#ast.ordering.orders.map((order) => ({
			field: order.field,
			direction: order.direction,
		}))

		return this.#with({
			ordering: normalizeQueryOrdering(this.schema, [
				...orders,
				...fields.map((field) => ({ field, direction })),
			]),
		})
	}

	#appendFilter(
		filter: QueryFilterNode<TSchema>,
		logicalKind: 'and' | 'or' = 'and',
	): Query<TSchema> {
		const currentExpression = this.#ast.where?.expression
		const expression =
			currentExpression === undefined
				? filter
				: logicalKind === 'and'
					? normalizeLogicalFilter<QueryPrimitiveFilterNode<TSchema>>({
							kind: 'and',
							expressions: [currentExpression, filter],
						})
					: normalizeLogicalFilter<QueryPrimitiveFilterNode<TSchema>>({
							kind: 'or',
							expressions: [currentExpression, filter],
						})
		const where: QueryWhereNode<QueryFilterNode<TSchema>> = immutableRecord({
			kind: 'where',
			expression,
		})

		return this.#with({ where })
	}

	#combine(
		query: Query<TSchema>,
		logicalKind: 'and' | 'or',
		negate: boolean,
	): Query<TSchema> {
		if (query.schema !== this.schema) {
			throw new TypeError('logical queries must use the same schema definition')
		}

		const otherExpression = query.ast.where?.expression

		if (otherExpression === undefined) {
			return this.#with({})
		}

		const expression = negate
			? normalizeLogicalFilter<QueryPrimitiveFilterNode<TSchema>>({
					kind: 'not',
					expression: otherExpression,
				})
			: otherExpression

		return this.#appendFilter(expression, logicalKind)
	}

	#with(patch: QueryAstPatch<TSchema>): Query<TSchema> {
		return Query.#fromAst(immutableRecord({ ...this.#ast, ...patch }))
	}

	static #fromAst<const TNextSchema extends SchemaDefinition>(
		ast: QueryBuilderAst<TNextSchema>,
	): Query<TNextSchema> {
		const query = new Query(ast.schema.definition)

		// Private fields remain assignable internally after the public shell is frozen.
		query.#ast = ast

		return query
	}
}
