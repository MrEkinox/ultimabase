import {
	getOperationSchema,
	protectedPolicy,
	type CompiledSchemaRegistry,
	type DatabaseRowFilterNode,
	type ProtectedPolicyDefinition,
} from '@ultimabase/core'
import type { PluginIdentity } from '@ultimabase/core/plugin'
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
 * `.softDelete()`, Master included; restore and purge see only those rows.
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

	return protectedPolicy({
		evaluate: ({ operation }) => {
			if (!targets.has(getOperationSchema(operation))) return undefined
			if (operation.kind === 'create-one' || operation.kind === 'create-many') {
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
