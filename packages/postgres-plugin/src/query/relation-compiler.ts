import {
	relationsFilterToSQL,
	type RelationsFilter,
	type SQL,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

import { required } from '../required.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import {
	resolveCompiledPostgresField,
	type CompiledPostgresRelation,
} from '../schema/contracts.js'
import type {
	PostgresDrizzlePointerBinding,
	PostgresDrizzleRelationBinding,
} from '../schema/drizzle-relations.js'

/** Erases Drizzle's generated table typing, which dynamic schemas cannot provide. */
export type PostgresDrizzleRelationsFilter = RelationsFilter<
	TableRelationalConfig,
	TablesRelationalConfig
>

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
	const tableDefinition = required(
		definitions[
			side === 'source' ? binding.sourceTableKey : binding.targetTableKey
		],
		'PostgreSQL Drizzle relation table is unavailable',
	)

	return required(
		relationsFilterToSQL(
			table,
			filter,
			tableDefinition.relations,
			definitions,
			depth,
		),
		'PostgreSQL Drizzle relation filter is empty',
	)
}

/** Compiles one private relation edge as a parameterized target-row predicate. */
export const compilePostgresRelationPredicate = (
	catalog: PostgresSchemaCatalog,
	relation: CompiledPostgresRelation,
	sourceObjectId: string,
	targetTable: PgTable = relation.target.table,
): SQL => {
	resolveCompiledPostgresField(relation.source, 'id')

	const binding = catalog.getDrizzleRelation(relation)
	// The generated table retains `id`, but its dynamic key is intentionally private.
	const targetFilter = {
		id: sourceObjectId,
	} as unknown as PostgresDrizzleRelationsFilter

	return compilePostgresDrizzleRelationFilter(
		catalog,
		binding,
		'target',
		targetTable,
		// Generated relation keys are unknown to Drizzle's erased relation map.
		{ [binding.reverseRelationName]: targetFilter },
	)
}
