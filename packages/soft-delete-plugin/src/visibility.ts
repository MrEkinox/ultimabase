import {
	getOperationSchema,
	protectedPolicy,
	type CompiledSchemaRegistry,
	type DatabaseRowFilterNode,
	type ProtectedPolicyDefinition,
	type SchemaDefinition,
} from '@ultimabase/core'
import type { PluginIdentity } from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { purgeMutationName, restoreMutationName } from './contracts.js'

export const softDeleteTombstoneContributionId =
	'official-soft-delete-tombstone'
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

const isOwnedAdministration = (
	operation: unknown,
	owner: PluginIdentity,
): boolean => {
	if (
		!isPlainRecord(operation) ||
		operation.kind !== 'plugin-schema-mutation' ||
		!isPlainRecord(operation.owner) ||
		!isPlainRecord(operation.mutation)
	) {
		return false
	}
	return (
		operation.owner.kind === 'plugin' &&
		operation.owner.pluginId === owner.pluginId &&
		operation.owner.instanceId === owner.instanceId &&
		operation.mutation.version === '1.0.0' &&
		((operation.command === 'restore' &&
			operation.mutation.name === restoreMutationName) ||
			(operation.command === 'purge' &&
				operation.mutation.name === purgeMutationName))
	)
}

/** @internal Matches only the tombstone contributed by one exact plugin instance. */
export const isSoftDeleteTombstoneOwner = (
	schema: SchemaDefinition,
	owner: PluginIdentity,
): boolean => {
	const provenance = schema.provenance.fields[softDeleteTombstoneFieldName]
	return (
		provenance?.contributionId === softDeleteTombstoneContributionId &&
		provenance.owner.kind === 'plugin' &&
		provenance.owner.pluginId === owner.pluginId &&
		provenance.owner.instanceId === owner.instanceId
	)
}

/** Creates the private application-local visibility plan for enabled schemas. */
export const createSoftDeleteVisibilityPolicy = (
	schemas: CompiledSchemaRegistry,
	owner: PluginIdentity,
): ProtectedPolicyDefinition => {
	// Only exact compiled schemas with this instance's tombstone enter the policy.
	const targets = new Set<unknown>(
		schemas
			.values()
			.filter((schema) => isSoftDeleteTombstoneOwner(schema, owner)),
	)

	return protectedPolicy({
		evaluate: ({ operation }) => {
			const operationSchema = getOperationSchema(operation)
			if (!targets.has(operationSchema)) return undefined

			if (operation.kind === 'create-one' || operation.kind === 'create-many') {
				return undefined
			}
			return immutableRecord({
				rowFilter: isOwnedAdministration(operation, owner)
					? tombstonedRowFilter
					: visibleRowFilter,
			})
		},
		master: 'enforce',
	})
}
