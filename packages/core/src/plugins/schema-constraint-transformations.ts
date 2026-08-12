import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { areSchemaDeclarationValuesCompatible } from '../schema/schema/definition.js'
import { createSchemaContributionProvenance } from '../schema/schema/provenance.js'
import { sameOwner } from './schema-selectors.js'
import {
	type SchemaTransformationContext,
	type SchemaTransformationState,
} from './schema-transformation-context.js'
import { type SchemaPatchOperation } from './schema-patch-contracts.js'

export const applyConstraintOperation = (
	context: SchemaTransformationContext,
	state: SchemaTransformationState,
	operation: SchemaPatchOperation,
): boolean => {
	const { candidate, patch } = context
	if (
		operation.kind === 'constraint:add' ||
		operation.kind === 'constraint:replace' ||
		operation.kind === 'constraint:remove'
	) {
		const targetPosition =
			operation.kind === 'constraint:add'
				? -1
				: state.provenance.constraints.findIndex(
						(entry) =>
							sameOwner(entry.provenance.owner, operation.target.owner) &&
							entry.provenance.contributionId ===
								operation.target.contributionId,
					)
		const current =
			targetPosition < 0 ? undefined : state.constraints[targetPosition]

		if (operation.kind !== 'constraint:add') {
			if (current === undefined) {
				throw new TypeError('Stale schema constraint identity')
			}
			if (
				!areSchemaDeclarationValuesCompatible(
					current,
					operation.target.expected,
				)
			) {
				throw new TypeError('Stale schema constraint shape')
			}
		}

		const transformProvenance = createSchemaContributionProvenance(
			patch.owner,
			operation.contributionId,
			patch.staticOptions,
		)
		state.constraints = immutableArray(
			operation.kind === 'constraint:add'
				? [...state.constraints, operation.constraint]
				: operation.kind === 'constraint:remove'
					? state.constraints.filter((_, index) => index !== targetPosition)
					: state.constraints.map((constraint, index) =>
							index === targetPosition ? operation.constraint : constraint,
						),
		)
		const constraintEntries =
			operation.kind === 'constraint:add'
				? [
						...state.provenance.constraints,
						immutableRecord({
							definition: operation.constraint,
							provenance: transformProvenance,
						}),
					]
				: operation.kind === 'constraint:remove'
					? state.provenance.constraints.filter(
							(_, index) => index !== targetPosition,
						)
					: state.provenance.constraints.map((entry, index) =>
							index === targetPosition
								? immutableRecord({
										definition: operation.constraint,
										provenance: transformProvenance,
									})
								: entry,
						)
		state.provenance = immutableRecord({
			...state.provenance,
			constraints: immutableArray(constraintEntries),
			patches: immutableArray([
				...state.provenance.patches,
				immutableRecord({
					kind: operation.kind,
					provenance: transformProvenance,
					targetClassName: candidate.schema.className,
				}),
			]),
		})
		return true
	}

	return false
}
