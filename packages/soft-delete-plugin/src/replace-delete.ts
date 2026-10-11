import {
	normalizeUpdateExpression,
	persistencePlanRewriter,
	rewriteDeletePersistencePlan,
	type CompiledSchemaRegistry,
	type PersistencePlanRewriterDefinition,
} from '@ultimabase/core'
import type { PluginIdentity } from '@ultimabase/core/plugin'

import type { SoftDeleteMode } from './contracts.js'
import { resolveSoftDeleteMode } from './options.js'
import {
	isSoftDeleteTombstoneOwner,
	softDeleteTombstoneFieldName,
} from './visibility.js'

/** Compiles the exact schemas whose native delete physically writes a tombstone. */
export const createSoftDeletePersistenceRewriter = (
	schemas: CompiledSchemaRegistry,
	owner: PluginIdentity,
	defaultMode: SoftDeleteMode,
): PersistencePlanRewriterDefinition => {
	const targets = schemas
		.values()
		.filter(
			(schema) =>
				isSoftDeleteTombstoneOwner(schema, owner) &&
				resolveSoftDeleteMode(schema, defaultMode) === 'replace-delete',
		)

	return persistencePlanRewriter({
		operations: ['delete-one'],
		rewrite: ({ plan }) =>
			rewriteDeletePersistencePlan(
				plan,
				normalizeUpdateExpression(plan.target.schema.definition, {
					[softDeleteTombstoneFieldName]: true,
				}),
			),
		schemas: targets,
	})
}
