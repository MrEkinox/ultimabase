import {
	getOperationSchema,
	protectedPolicy,
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
 * Hides soft-deleted rows from every operation on the schemas that called
 * `.softDelete()`; restore and purge see only those rows. Reads by a caller
 * holding `readDeleted` (Master always does) see every row.
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
				(await holdsSchemaPermission(context, schema, readDeletedPermission))
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
