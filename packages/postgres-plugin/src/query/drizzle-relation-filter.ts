import {
	relationsFilterToSQL,
	type RelationsFilter,
	type SQL,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import type {
	PostgresDrizzlePointerBinding,
	PostgresDrizzleRelationBinding,
} from '../schema/drizzle-relations.js'

type PostgresDrizzleRelationsFilter = RelationsFilter<
	TableRelationalConfig,
	TablesRelationalConfig
>

/** Builds one generated relation key that Drizzle's erased runtime map cannot infer. */
export const createPostgresDrizzleRelationFilter = (
	relationName: string,
	target: PostgresDrizzleRelationsFilter,
): PostgresDrizzleRelationsFilter => ({ [relationName]: target })

/** Delegates relation joins and correlation aliases to Drizzle RQB v2. */
export const compilePostgresDrizzleRelationFilter = (
	catalog: PostgresSchemaCatalog,
	binding: PostgresDrizzlePointerBinding | PostgresDrizzleRelationBinding,
	side: 'source' | 'target',
	table: PgTable,
	filter: PostgresDrizzleRelationsFilter,
	depth = 0,
): SQL => {
	const definitions = catalog.drizzleRelationDefinitions()
	const tableKey =
		side === 'source' ? binding.sourceTableKey : binding.targetTableKey
	const tableDefinition = definitions[tableKey]

	if (tableDefinition === undefined) {
		throw new TypeError(`PostgreSQL Drizzle relation table is unavailable`)
	}

	const predicate = relationsFilterToSQL(
		table,
		filter,
		tableDefinition.relations,
		definitions,
		depth,
	)

	if (predicate === undefined) {
		throw new TypeError('PostgreSQL Drizzle relation filter is empty')
	}

	return predicate
}
