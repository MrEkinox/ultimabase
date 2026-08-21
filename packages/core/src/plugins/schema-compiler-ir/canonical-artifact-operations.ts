import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { SchemaCompilerPatchOperation } from './contracts.js'
import {
	appendCompilerPatchProvenance,
	sameCompilerOwner,
} from './canonical-state.js'
import type { CanonicalSchemaOperationContext } from './canonical-operation-context.js'
import {
	assertCompilerTarget,
	operationContributionProvenance,
} from './canonical-operation-context.js'

const applyConstraintOperation = (
	context: CanonicalSchemaOperationContext,
	operation: SchemaCompilerPatchOperation,
): boolean => {
	if (
		operation.kind !== 'constraint:add' &&
		operation.kind !== 'constraint:replace' &&
		operation.kind !== 'constraint:remove'
	) {
		return false
	}
	const { state } = context
	const provenance = operationContributionProvenance(
		context,
		operation.contributionId,
	)
	if (operation.kind === 'constraint:add') {
		state.constraints = immutableArray([
			...state.constraints,
			immutableRecord({ ...operation.constraint, provenance }),
		])
	} else {
		const position = state.constraints.findIndex(
			(entry) =>
				sameCompilerOwner(entry.provenance.owner, operation.target.owner) &&
				entry.provenance.contributionId === operation.target.contributionId,
		)
		const current = state.constraints[position]
		if (current === undefined) {
			throw new TypeError('Stale schema constraint identity')
		}
		assertCompilerTarget(
			current.artifact,
			current.provenance,
			operation.target,
			`${state.className}.constraints[${String(position)}]`,
		)
		state.constraints = immutableArray(
			operation.kind === 'constraint:remove'
				? state.constraints.filter((_, index) => index !== position)
				: state.constraints.map((entry, index) =>
						index === position
							? immutableRecord({ ...operation.constraint, provenance })
							: entry,
					),
		)
	}
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
