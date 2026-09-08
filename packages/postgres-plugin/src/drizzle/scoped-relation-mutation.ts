import {
	isRelationUpdateExpression,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterialization,
	type UpdateExpressionNode,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import type { CompiledPostgresRelation } from '../schema/contracts.js'
import type { PostgresDrizzleClient } from './client.js'
import { executePostgresRelationMutation } from './relation-executor.js'

interface PostgresRelationMutationResult {
	readonly materialization: DatabaseMutationMaterialization
	readonly record: DatabaseLogicalRecord
}

/** Applies an edge delta and avoids a redundant source update when no scalar changed. */
export const executePostgresScopedRelationMutation = async (
	client: PostgresDrizzleClient,
	relation: CompiledPostgresRelation,
	update: UpdateExpressionNode,
	previous: DatabaseLogicalRecord,
): Promise<PostgresRelationMutationResult | undefined> => {
	await executePostgresRelationMutation(client, relation, update, previous.id)

	if (
		!isRelationUpdateExpression(update) ||
		update.operations.some((operation) => operation.kind !== 'relation')
	) {
		return undefined
	}

	return immutableRecord({
		materialization: immutableRecord({
			current: previous,
			kind: 'update' as const,
			previous,
		}),
		record: previous,
	})
}
