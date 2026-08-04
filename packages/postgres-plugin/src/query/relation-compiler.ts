import { eq, inArray, type SQL } from 'drizzle-orm'

import type { PostgresDrizzleClient } from '../drizzle/client.js'
import type { CompiledPostgresRelation } from '../schema/contracts.js'
import { resolveCompiledPostgresField } from '../schema/field.js'

/** Compiles one private relation edge as a parameterized target-row predicate. */
export const compilePostgresRelationPredicate = (
	client: PostgresDrizzleClient,
	relation: CompiledPostgresRelation,
	sourceObjectId: string,
): SQL => {
	const encodedSourceId = resolveCompiledPostgresField(
		relation.source,
		'id',
	).codec.encode(sourceObjectId)

	if (relation.storage.kind === 'pointer') {
		return eq(relation.storage.targetColumn, encodedSourceId)
	}

	const targetId = resolveCompiledPostgresField(relation.target, 'id').column
	const relatedTargetIds = client
		.select({ id: relation.storage.targetColumn })
		.from(relation.storage.relation.table)
		.where(eq(relation.storage.sourceColumn, encodedSourceId))

	return inArray(targetId, relatedTargetIds)
}
