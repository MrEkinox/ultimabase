import {
	getOperationSchema,
	protectedPolicy,
	type CompiledSchemaRegistry,
	type DatabaseRowFilterNode,
	type PluginIdentity,
	type ProtectedPolicyDefinition,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

export const softDeleteTombstoneContributionId =
	'official-soft-delete-tombstone'
export const softDeleteTombstoneFieldName = 'isDeleted'

const visibleRowFilter: DatabaseRowFilterNode = immutableRecord({
	field: softDeleteTombstoneFieldName,
	kind: 'equal',
	value: false,
})

interface SoftDeleteVisibilityPlan {
	readonly schema: SchemaDefinition
}

const isExactOwner = (
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

const compileVisibilityPlan = (
	schemas: CompiledSchemaRegistry,
	owner: PluginIdentity,
): readonly SoftDeleteVisibilityPlan[] =>
	immutableArray(
		schemas
			.values()
			.filter((schema) => isExactOwner(schema, owner))
			.map((schema) =>
				immutableRecord({
					schema,
				}),
			),
	)

/** Creates the private application-local visibility plan for enabled schemas. */
export const createSoftDeleteVisibilityPolicy = (
	schemas: CompiledSchemaRegistry,
	owner: PluginIdentity,
): ProtectedPolicyDefinition => {
	const plans = compileVisibilityPlan(schemas, owner)

	return protectedPolicy({
		evaluate: ({ operation }) => {
			const operationSchema = getOperationSchema(operation)
			const plan = plans.find(({ schema }) => schema === operationSchema)
			if (plan === undefined) return undefined

			return operation.kind === 'create-one' || operation.kind === 'create-many'
				? undefined
				: immutableRecord({ rowFilter: visibleRowFilter })
		},
		master: 'enforce',
	})
}
