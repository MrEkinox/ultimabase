import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { areSchemaDeclarationValuesCompatible } from '../schema/schema/definition.js'
import { normalizeContributedSchemaIndex } from '../schema/schema/indexes.js'
import { createSchemaContributionProvenance } from '../schema/schema/provenance.js'
import { sameOwner } from './schema-selectors.js'
import {
	type SchemaTransformationContext,
	type SchemaTransformationState,
} from './schema-transformation-context.js'
import { type SchemaPatchOperation } from './schema-patch-contracts.js'

export const applyIndexOperation = (
	context: SchemaTransformationContext,
	state: SchemaTransformationState,
	operation: SchemaPatchOperation,
): boolean => {
	const { candidate, patch } = context
	if (operation.kind === 'index:replace' || operation.kind === 'index:remove') {
		const indexPosition = state.provenance.indexes.findIndex(
			(entry) =>
				sameOwner(entry.provenance.owner, operation.target.owner) &&
				entry.provenance.contributionId === operation.target.contributionId,
		)
		const entry = state.provenance.indexes[indexPosition]
		const actual = state.indexes[indexPosition]
		if (entry === undefined || actual === undefined) {
			throw new TypeError('Stale schema index identity')
		}
		if (
			!areSchemaDeclarationValuesCompatible(actual, operation.target.expected)
		) {
			throw new TypeError('Stale schema index shape')
		}
		const transformProvenance = createSchemaContributionProvenance(
			patch.owner,
			operation.contributionId,
			patch.staticOptions,
		)
		if (operation.kind === 'index:remove') {
			state.indexes = immutableArray(
				state.indexes.filter((_, position) => position !== indexPosition),
			)
			state.provenance = immutableRecord({
				...state.provenance,
				indexes: immutableArray(
					state.provenance.indexes.filter(
						(_, position) => position !== indexPosition,
					),
				),
			})
		} else {
			const replacement = normalizeContributedSchemaIndex(
				state.fields,
				operation.index,
			)
			state.indexes = immutableArray(
				state.indexes.map((index, position) =>
					position === indexPosition ? replacement : index,
				),
			)
			state.provenance = immutableRecord({
				...state.provenance,
				indexes: immutableArray(
					state.provenance.indexes.map((candidate, position) =>
						position === indexPosition
							? immutableRecord({
									definition: replacement,
									provenance: transformProvenance,
								})
							: candidate,
					),
				),
			})
		}
		state.provenance = immutableRecord({
			...state.provenance,
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

	if (operation.kind !== 'index:add') return false
	const index = normalizeContributedSchemaIndex(state.fields, operation.index)
	state.indexes = immutableArray([...state.indexes, index])
	const indexProvenance = createSchemaContributionProvenance(
		patch.owner,
		operation.contributionId,
		patch.staticOptions,
	)
	state.provenance = immutableRecord({
		...state.provenance,
		indexes: immutableArray([
			...state.provenance.indexes,
			immutableRecord({
				definition: index,
				provenance: indexProvenance,
			}),
		]),
		patches: immutableArray([
			...state.provenance.patches,
			immutableRecord({
				kind: operation.kind,
				provenance: indexProvenance,
				targetClassName: candidate.schema.className,
			}),
		]),
	})
	return true
}
