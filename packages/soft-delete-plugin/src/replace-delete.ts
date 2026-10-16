import {
	normalizeUpdateExpression,
	persistencePlanRewriter,
	rewriteDeletePersistencePlan,
	type CompiledSchemaRegistry,
	type PersistencePlanRewriterDefinition,
} from '@ultimabase/core'
import type { PluginIdentity } from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import { readSoftDeleteMode } from './options.js'

/** @internal Values written when one row is soft-deleted. */
export const softDeletedValues = (): Readonly<Record<string, unknown>> =>
	immutableRecord({ deletedAt: new Date().toISOString(), isDeleted: true })

/** @internal Values written when one row is restored. */
export const restoredValues = (): Readonly<Record<string, unknown>> =>
	immutableRecord({ deletedAt: null, isDeleted: false })

/**
 * Turns `deleteOne` and `deleteMany` (one delete per target) into soft
 * deletes on the schemas that set `softDelete` without `mode: 'command'`.
 */
export const createSoftDeletePersistenceRewriter = (
	schemas: CompiledSchemaRegistry,
	owner: PluginIdentity,
): PersistencePlanRewriterDefinition =>
	persistencePlanRewriter({
		operations: ['delete-one'],
		rewrite: ({ plan }) =>
			rewriteDeletePersistencePlan(
				plan,
				normalizeUpdateExpression(
					plan.target.schema.definition,
					softDeletedValues(),
				),
			),
		schemas: schemas
			.values()
			.filter((schema) => readSoftDeleteMode(schema, owner) === 'delete'),
	})
