import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { CanonicalSchemaOperationContext } from './canonical-operation-context.js'
import { operationContributionProvenance } from './canonical-operation-context.js'
import { appendCompilerPatchProvenance } from './canonical-state.js'
import type { SchemaCompilerPatchOperation } from './contracts.js'

const applyConstraintOperation = (
	context: CanonicalSchemaOperationContext,
	operation: SchemaCompilerPatchOperation,
): boolean => {
	if (operation.kind !== 'constraint:add') {
		return false
	}
	const { state } = context
	const provenance = operationContributionProvenance(
		context,
		operation.contributionId,
	)

	state.constraints = immutableArray([
		...state.constraints,
		immutableRecord({ ...operation.constraint, provenance }),
	])
	state.provenance = immutableRecord({
		...state.provenance,
		constraints: immutableArray(
			state.constraints.map((entry) =>
				immutableRecord({
					definition: entry.definition,
					provenance: entry.provenance,
				}),
			),
		),
	})
	appendCompilerPatchProvenance(state, operation.kind, provenance)
	return true
}

/** Applies portable-constraint operations directly to IR state. */
export const applyCanonicalArtifactOperation = (
	context: CanonicalSchemaOperationContext,
	operation: SchemaCompilerPatchOperation,
): boolean => applyConstraintOperation(context, operation)
