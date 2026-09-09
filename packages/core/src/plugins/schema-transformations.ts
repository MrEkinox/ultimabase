import { immutableRecord } from '@ultimabase/shared'

import type { PreparedSchemaCompilation } from '../schema/schema/definition.js'
import type { SchemaContributionProvenance } from '../schema/schema/provenance.js'
import type {
	OptionDefinitionIndex,
	OwnedSchemaPatch,
	ResolvedFieldOptions,
} from './schema-declaration-contracts.js'
import { applyConstraintOperation } from './schema-constraint-transformations.js'
import { applyFieldOperation } from './schema-field-transformations.js'
import { applyIndexOperation } from './schema-index-transformations.js'
import { coreSchemaKeys } from './schema-option-resolution.js'
import { applyOptionOperation } from './schema-option-transformations.js'
import type {
	SchemaTransformationContext,
	SchemaTransformationState,
} from './schema-transformation-context.js'

const operationHandlers = [
	applyConstraintOperation,
	applyFieldOperation,
	applyOptionOperation,
	applyIndexOperation,
] as const

export const applyPatch = (
	candidate: PreparedSchemaCompilation,
	patch: OwnedSchemaPatch,
	definitions: OptionDefinitionIndex,
	resolvedFields: ResolvedFieldOptions,
): PreparedSchemaCompilation => {
	const state: SchemaTransformationState = {
		constraints: candidate.definition.constraints,
		developerFields: candidate.developerFields,
		fields: candidate.definition.persistedFields,
		indexes: candidate.definition.indexes,
		provenance: candidate.definition.provenance,
		schemaOptionValues: immutableRecord(
			Object.fromEntries(
				Object.entries(candidate.definition).filter(
					([name]) => !coreSchemaKeys.has(name),
				),
			),
		),
	}
	const context: SchemaTransformationContext = {
		candidate,
		definitions,
		patch,
		resolvedFields,
	}
	const contributionIds = new Set<string>()
	const hasOwnedContributionId = (contributionId: string): boolean => {
		const candidates: SchemaContributionProvenance[] = [
			state.provenance.schema,
			...Object.values(state.provenance.fields),
			...state.provenance.constraints.map(({ provenance }) => provenance),
			...state.provenance.indexes.map(({ provenance }) => provenance),
			...state.provenance.patches.map(({ provenance }) => provenance),
		]

		return candidates.some(
			(candidate) =>
				candidate.contributionId === contributionId &&
				candidate.owner.kind === 'plugin' &&
				candidate.owner.pluginId === patch.owner.pluginId &&
				candidate.owner.instanceId === patch.owner.instanceId,
		)
	}

	for (const operation of patch.operations) {
		if (
			contributionIds.has(operation.contributionId) ||
			hasOwnedContributionId(operation.contributionId)
		) {
			throw new TypeError(
				`Duplicate schema patch contributionId: ${operation.contributionId}`,
			)
		}
		contributionIds.add(operation.contributionId)

		const handled = operationHandlers.some((handler) =>
			handler(context, state, operation),
		)
		if (!handled) {
			throw new TypeError(
				`Unsupported schema patch operation: ${operation.kind}`,
			)
		}
	}

	return immutableRecord({
		definition: immutableRecord({
			...state.schemaOptionValues,
			className: candidate.definition.className,
			constraints: state.constraints,
			fields: immutableRecord({
				...state.fields,
				...candidate.definition.virtualFields,
			}),
			indexes: state.indexes,
			persistedFields: state.fields,
			provenance: state.provenance,
			virtualFields: candidate.definition.virtualFields,
		}),
		developerFields: state.developerFields,
		schema: candidate.schema,
	})
}
