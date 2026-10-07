import {
	type QueryAst,
	type QueryFilterNode,
	type QueryOrderNode,
} from '@ultimabase/core'
import type { SchemaDefinition } from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { asc, desc, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import type { CompiledPostgresSchema } from '../schema/contracts.js'
import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
} from '../schema/field.js'
import {
	compilePostgresFilter,
	type PostgresRelationPredicateCompiler,
} from './filter-compiler.js'

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
	const requestedNames =
		query.selection.fields.length === 0
			? Object.keys(schema.fields)
			: query.selection.fields.map(({ field }) => field)
	// Object identity is retained privately by Runtime and removed from public
	// projections when the developer did not explicitly select it.
	const names = requestedNames.includes('id')
		? requestedNames
		: [...requestedNames, 'id']
	return compilePostgresSelection(schema, names)
}

const compileOrderBy = (
	orders: readonly QueryOrderNode[],
	schema: CompiledPostgresSchema,
): readonly SQL[] =>
	immutableArray(
		orders.map((order) => {
			const column = resolveCompiledPostgresField(schema, order.field).column

			// Explicit null placement keeps ordering stable across directions.
			return order.direction === 'ascending'
				? sql`${asc(column)} NULLS LAST`
				: sql`${desc(column)} NULLS LAST`
		}),
	)

/** Compiles projection, ordering, limit, offset, and portable filters. */
export const compilePostgresQueryClauses = <TSchema extends SchemaDefinition>(
	query: QueryAst<TSchema, QueryFilterNode<TSchema>>,
	schema: CompiledPostgresSchema,
	relationCompiler?: PostgresRelationPredicateCompiler,
): CompiledPostgresQueryClauses => {
	const filter =
		query.where === undefined
			? undefined
			: compilePostgresFilter(query.where.expression, schema, relationCompiler)

	return immutableRecord({
		...(query.limit === undefined ? {} : { limit: query.limit }),
		...(query.pagination?.kind === 'offset-pagination'
			? { offset: query.pagination.offset }
			: {}),
		orderBy: compileOrderBy(query.ordering.orders, schema),
		selection: compileSelection(query, schema),
		...(filter === undefined ? {} : { where: filter }),
	})
}
