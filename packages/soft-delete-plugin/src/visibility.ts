import {
	getOperationSchema,
	protectedPolicy,
	readOperationQueries,
	traverseQueryExpression,
	type RuntimeLogicalOperationAst,
	type CompiledSchemaRegistry,
	type DatabaseRowFilterNode,
	type ProtectedPolicyDefinition,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	holdsSchemaPermission,
	type PluginIdentity,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { readSoftDeleteMode } from './options.js'

/** The field the protected filter reads; `deletedAt` only records the time. */
export const softDeleteTombstoneFieldName = 'isDeleted'

const visibleRowFilter: DatabaseRowFilterNode = immutableRecord({
	field: softDeleteTombstoneFieldName,
	kind: 'equal',
	value: false,
})

const tombstonedRowFilter: DatabaseRowFilterNode = immutableRecord({
	field: softDeleteTombstoneFieldName,
	kind: 'equal',
	value: true,
})

/** The permission that lets ordinary reads see soft-deleted rows (ADR-0317). */
export const readDeletedPermission = 'readDeleted'

// Ordinary reads: with `readDeleted` they see every row.
const readOperations: ReadonlySet<string> = new Set([
	'count',
	'exists',
	'find-many',
	'find-one',
	'get',
])

// Commands that act on hidden rows; every other operation sees visible rows.
const tombstoneCommands: ReadonlySet<string> = new Set([
	'purgeMany',
	'purgeOne',
	'restoreMany',
	'restoreOne',
])

/**
 * Tells whether the caller's own filter constrains `isDeleted`: any condition
 * on it anywhere in the root `where` (inside AND, OR and NOT included), but
 * not a condition inside a relation predicate, which concerns another schema
 * (ADR-0317, 6.1 amendment).
 */
export const constrainsTombstones = (
	operation: RuntimeLogicalOperationAst,
): boolean => {
	let found = false
	for (const query of readOperationQueries(operation)) {
		if (query.where === undefined) continue
		traverseQueryExpression(query.where.expression, (candidate) => {
			if (candidate.kind === 'relation-predicate') return 'skip'
			if (candidate.field === softDeleteTombstoneFieldName) found = true
			return found ? 'skip' : 'continue'
		})
	}
	return found
}

/** Recognizes this instance's restore and purge commands only. */
const isTombstoneCommand = (
	operation: unknown,
	owner: PluginIdentity,
): boolean =>
	isPlainRecord(operation) &&
	operation.kind === 'plugin-schema-mutation' &&
	typeof operation.command === 'string' &&
	tombstoneCommands.has(operation.command) &&
	isPlainRecord(operation.owner) &&
	operation.owner.kind === 'plugin' &&
	operation.owner.pluginId === owner.pluginId &&
	operation.owner.instanceId === owner.instanceId

/**
 * Hides soft-deleted rows from every operation on the schemas that set
 * `softDelete`; restore and purge see only those rows. Reads by a caller
 * holding `readDeleted` see every row, except Master: Master holds every
 * permission, but its reads keep the filter unless their own `where`
 * constrains `isDeleted`, so server jobs never include the trash silently.
 */
export const createSoftDeleteVisibilityPolicy = (
	schemas: CompiledSchemaRegistry,
	owner: PluginIdentity,
): ProtectedPolicyDefinition => {
	const targets = new Set<unknown>(
		schemas
			.values()
			.filter((schema) => readSoftDeleteMode(schema, owner) !== undefined),
	)
	const isTarget = (schema: unknown): schema is SchemaDefinition =>
		targets.has(schema)

	return protectedPolicy({
		evaluate: async ({ context, operation }) => {
			const schema = getOperationSchema(operation)
			if (!isTarget(schema)) return undefined
			if (operation.kind === 'create-one' || operation.kind === 'create-many') {
				return undefined
			}
			if (
				readOperations.has(operation.kind) &&
				(context.access.mode === 'master'
					? constrainsTombstones(operation)
					: await holdsSchemaPermission(context, schema, readDeletedPermission))
			) {
				return undefined
			}
			return immutableRecord({
				rowFilter: isTombstoneCommand(operation, owner)
					? tombstonedRowFilter
					: visibleRowFilter,
			})
		},
		master: 'enforce',
	})
}
