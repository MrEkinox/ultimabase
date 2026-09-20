import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { reservedSystemFieldNames } from '../../schema/schema/system-fields.js'
import type { CanonicalSchemaOperationContext } from './canonical-operation-context.js'
import { operationContributionProvenance } from './canonical-operation-context.js'
import { appendCompilerPatchProvenance } from './canonical-state.js'
import type {
	SchemaCompilerIndexNode,
	SchemaCompilerPatchOperation,
} from './contracts.js'

const normalizeCompilerIndex = (
	context: CanonicalSchemaOperationContext,
	index: SchemaCompilerIndexNode['definition'],
): SchemaCompilerIndexNode['definition'] => {
	if (index.fields.length < 2) {
		throw new TypeError('Composite index must contain at least two fields')
	}
	const knownFields = new Set([
		...context.state.fields
			.filter(({ kind }) => kind !== 'relation')
			.map(({ name }) => name),
		...reservedSystemFieldNames,
	])
	const seen = new Set<string>()
	for (const fieldName of index.fields) {
		if (!knownFields.has(fieldName)) {
			throw new TypeError(`Unknown index field: ${fieldName}`)
		}
		if (seen.has(fieldName)) {
			throw new TypeError(`Duplicate index field: ${fieldName}`)
		}
		seen.add(fieldName)
	}
	return immutableRecord({
		fields: immutableArray(index.fields),
		unique: index.unique,
	})
}

/** Applies composite index declarations directly to callback-free IR. */
export const applyCanonicalIndexOperation = (
	context: CanonicalSchemaOperationContext,
	operation: SchemaCompilerPatchOperation,
): boolean => {
	if (operation.kind !== 'index:add') {
		return false
	}
	const { state } = context
	const provenance = operationContributionProvenance(
		context,
		operation.contributionId,
	)

	const node = immutableRecord({
		definition: normalizeCompilerIndex(context, operation.index),
		provenance,
	})
	state.indexes = immutableArray([...state.indexes, node])
	state.provenance = immutableRecord({
		...state.provenance,
		indexes: immutableArray([
			...state.provenance.indexes,
			immutableRecord({
				definition: node.definition,
				provenance,
			}),
		]),
	})
	appendCompilerPatchProvenance(state, operation.kind, provenance)
	return true
}
