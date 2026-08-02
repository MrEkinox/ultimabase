import {
	normalizeQueryCursorOrdering,
	type QueryAst,
	type QueryCursorPayload,
	type QueryFilterNode,
	type QueryOrderNode,
} from '@ultimabase/core'
import type { SchemaDefinition } from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import {
	and,
	asc,
	desc,
	eq,
	gt,
	isNotNull,
	isNull,
	lt,
	or,
	sql,
	type SQL,
} from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import type {
	CompiledPostgresField,
	CompiledPostgresSchema,
} from '../schema/contracts.js'
import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
} from '../schema/field.js'
import { compilePostgresFilter } from './filter-compiler.js'

/** Collects query fragments reused later by read, update, and delete builders. */
export interface CompiledPostgresQueryClauses {
	readonly limit?: number
	readonly offset?: number
	readonly orderBy: readonly SQL[]
	readonly selection: Readonly<Record<string, PgColumn>>
	readonly where?: SQL
}

const compileSelection = <TSchema extends SchemaDefinition>(
	query: QueryAst<TSchema, QueryFilterNode<TSchema>>,
	schema: CompiledPostgresSchema,
): Readonly<Record<string, PgColumn>> => {
	const names =
		query.selection.fields.length === 0
			? Object.keys(schema.fields)
			: query.selection.fields.map(({ field }) => field)
	return compilePostgresSelection(schema, names)
}

const compileOrderBy = (
	orders: readonly QueryOrderNode[],
	schema: CompiledPostgresSchema,
): readonly SQL[] =>
	immutableArray(
		orders.map((order) => {
			const column = resolveCompiledPostgresField(schema, order.field).column

			// Explicit null placement makes cursor predicates independent from defaults.
			return order.direction === 'ascending'
				? sql`${asc(column)} NULLS LAST`
				: sql`${desc(column)} NULLS FIRST`
		}),
	)

const compileEqualCursorValue = (
	field: CompiledPostgresField,
	value: unknown,
): SQL => {
	if (value === null) {
		if (!field.plan.nullable) {
			throw new TypeError('PostgreSQL cursor value cannot be null')
		}

		return isNull(field.column)
	}

	return eq(field.column, field.codec.encode(value))
}

const compileAfterCursorValue = (
	field: CompiledPostgresField,
	direction: QueryOrderNode['direction'],
	value: unknown,
): SQL => {
	if (value === null) {
		if (!field.plan.nullable) {
			throw new TypeError('PostgreSQL cursor value cannot be null')
		}

		// Ascending NULLS LAST has no later value; descending NULLS FIRST resumes at non-null.
		return direction === 'ascending'
			? sql<boolean>`false`
			: isNotNull(field.column)
	}

	const encoded = field.codec.encode(value)

	if (direction === 'descending') {
		return lt(field.column, encoded)
	}
	if (!field.plan.nullable) {
		return gt(field.column, encoded)
	}

	const expression = or(gt(field.column, encoded), isNull(field.column))

	if (expression === undefined) {
		throw new TypeError('PostgreSQL cursor comparison could not be combined')
	}

	return expression
}

const assertCursorCompatibility = (
	payload: QueryCursorPayload,
	className: string,
	orders: readonly QueryOrderNode[],
): void => {
	if (payload.className !== className) {
		throw new TypeError(
			'PostgreSQL cursor payload does not match the query schema',
		)
	}

	if (
		payload.ordering.length !== orders.length ||
		payload.ordering.some((value, index) => {
			const order = orders.at(index)

			return value.field !== order?.field || value.direction !== order.direction
		})
	) {
		throw new TypeError(
			'PostgreSQL cursor payload does not match query ordering',
		)
	}
}

const compileCursorPredicate = (
	payload: QueryCursorPayload,
	orders: readonly QueryOrderNode[],
	schema: CompiledPostgresSchema,
): SQL => {
	const branches: SQL[] = []
	const equalPrefix: SQL[] = []

	for (const [index, order] of orders.entries()) {
		const cursorValue = payload.ordering[index]

		if (cursorValue === undefined) {
			throw new TypeError('PostgreSQL cursor payload is missing an order value')
		}

		const field = resolveCompiledPostgresField(schema, order.field)
		const comparison = compileAfterCursorValue(
			field,
			order.direction,
			cursorValue.value,
		)
		const branch = and(...equalPrefix, comparison)

		if (branch === undefined) {
			throw new TypeError('PostgreSQL cursor branch could not be combined')
		}

		branches.push(branch)
		equalPrefix.push(compileEqualCursorValue(field, cursorValue.value))
	}

	const predicate = or(...branches)

	if (predicate === undefined) {
		throw new TypeError('PostgreSQL cursor predicate requires stable ordering')
	}

	return predicate
}

/** Compiles projection, ordering, limit, offset, and an authenticated cursor payload. */
export const compilePostgresQueryClauses = <TSchema extends SchemaDefinition>(
	query: QueryAst<TSchema, QueryFilterNode<TSchema>>,
	schema: CompiledPostgresSchema,
	cursorPayload?: QueryCursorPayload,
): CompiledPostgresQueryClauses => {
	const cursorPagination = query.pagination?.kind === 'cursor-pagination'
	const stableOrdering = cursorPagination
		? normalizeQueryCursorOrdering(
				query.schema.definition,
				query.ordering.orders,
			)
		: query.ordering
	const cursorRequested =
		cursorPagination && query.pagination.after !== undefined

	if (cursorRequested !== (cursorPayload !== undefined)) {
		throw new TypeError(
			'PostgreSQL cursor payload must accompany an after cursor only',
		)
	}

	if (cursorPayload !== undefined) {
		assertCursorCompatibility(
			cursorPayload,
			query.schema.definition.className,
			stableOrdering.orders,
		)
	}

	const filter =
		query.where === undefined
			? undefined
			: compilePostgresFilter(query.where.expression, schema)
	const cursor =
		cursorPayload === undefined
			? undefined
			: compileCursorPredicate(cursorPayload, stableOrdering.orders, schema)
	const where =
		filter === undefined
			? cursor
			: cursor === undefined
				? filter
				: and(filter, cursor)

	if (filter !== undefined && cursor !== undefined && where === undefined) {
		throw new TypeError('PostgreSQL query predicates could not be combined')
	}

	return immutableRecord({
		...(query.limit === undefined ? {} : { limit: query.limit }),
		...(query.pagination?.kind === 'offset-pagination'
			? { offset: query.pagination.skip }
			: {}),
		orderBy: compileOrderBy(stableOrdering.orders, schema),
		selection: compileSelection(query, schema),
		...(where === undefined ? {} : { where }),
	})
}
