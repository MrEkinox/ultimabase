import type {
	RelationsFilter,
	SQL,
	TableRelationalConfig,
	TablesRelationalConfig,
} from 'drizzle-orm'

import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { CompiledPostgresRelation } from '../schema/contracts.js'
import { resolveCompiledPostgresField } from '../schema/field.js'
import {
	compilePostgresDrizzleRelationFilter,
	createPostgresDrizzleRelationFilter,
} from './drizzle-relation-filter.js'

type PostgresDrizzleRelationsFilter = RelationsFilter<
	TableRelationalConfig,
	TablesRelationalConfig
>

/** Compiles one private relation edge as a parameterized target-row predicate. */
export const compilePostgresRelationPredicate = (
	catalog: PostgresSchemaCatalog,
	relation: CompiledPostgresRelation,
	sourceObjectId: string,
): SQL => {
	resolveCompiledPostgresField(relation.source, 'id')

	const binding = catalog.getDrizzleRelation(relation)
	// The generated table retains `id`, but its dynamic key is intentionally private.
	const targetFilter = {
		id: sourceObjectId,
	} as unknown as PostgresDrizzleRelationsFilter
	const filter = createPostgresDrizzleRelationFilter(
		binding.reverseRelationName,
		targetFilter,
	)

	return compilePostgresDrizzleRelationFilter(
		catalog,
		binding,
		'target',
		relation.target.table,
		filter,
	)
}
