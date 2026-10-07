import type {
	QueryAst,
	QueryFilterNode,
	QuerySelectionNode,
	SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { asc, desc, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
	type CompiledPostgresSchema,
} from '../schema/contracts.js'
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

/**
 * Lists the selected logical fields plus `id`. Object identity is retained
 * privately by Runtime and removed from public projections when the developer
 * did not explicitly select it.
 */
export const selectPostgresFieldNames = (
	selection: QuerySelectionNode,
	schema: CompiledPostgresSchema,
): readonly string[] => {
	const requested =
		selection.fields.length === 0
			? Object.keys(schema.fields)
			: selection.fields.map(({ field }) => field)

	return requested.includes('id') ? requested : [...requested, 'id']
}

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
	const orderBy = query.ordering.orders.map(({ direction, field }) => {
		const column = resolveCompiledPostgresField(schema, field).column

		// Explicit null placement keeps ordering stable across directions.
		return direction === 'ascending'
			? sql`${asc(column)} NULLS LAST`
			: sql`${desc(column)} NULLS LAST`
	})

	return immutableRecord({
		...(query.limit === undefined ? {} : { limit: query.limit }),
		...(query.pagination?.kind === 'offset-pagination'
			? { offset: query.pagination.offset }
			: {}),
		orderBy: immutableArray(orderBy),
		selection: compilePostgresSelection(
			schema,
			selectPostgresFieldNames(query.selection, schema),
		),
		...(filter === undefined ? {} : { where: filter }),
	})
}
