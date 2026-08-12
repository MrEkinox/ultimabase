import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { reservedSystemFieldNames } from '../../schema/schema/system-fields.js'
import type {
	SchemaCompilerIndexNode,
	SchemaCompilerPatchOperation,
} from './contracts.js'
import {
	appendCompilerPatchProvenance,
	sameCompilerOwner,
} from './canonical-state.js'
import type { CanonicalSchemaOperationContext } from './canonical-operation-context.js'
import {
	assertCompilerTarget,
	operationContributionProvenance,
} from './canonical-operation-context.js'

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
	if (
		operation.kind !== 'index:add' &&
		operation.kind !== 'index:replace' &&
		operation.kind !== 'index:remove'
	) {
		return false
	}
	const { state } = context
	const provenance = operationContributionProvenance(
		context,
		operation.contributionId,
	)
	if (operation.kind === 'index:add') {
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

	const position = state.indexes.findIndex(
		(entry) =>
			sameCompilerOwner(entry.provenance.owner, operation.target.owner) &&
			entry.provenance.contributionId === operation.target.contributionId,
	)
	const current = state.indexes[position]
	if (current === undefined) throw new TypeError('Stale schema index identity')
	assertCompilerTarget(
		current.definition,
		current.provenance,
		operation.target,
		`${state.className}.indexes[${String(position)}]`,
		{ structural: true },
	)
	if (operation.kind === 'index:remove') {
		state.indexes = immutableArray(
			state.indexes.filter((_, index) => index !== position),
		)
	} else {
		const replacement = immutableRecord({
			definition: normalizeCompilerIndex(context, operation.index),
			provenance,
		})
		state.indexes = immutableArray(
			state.indexes.map((entry, index) =>
				index === position ? replacement : entry,
			),
		)
	}
	state.provenance = immutableRecord({
		...state.provenance,
		indexes: immutableArray(
			state.indexes.map((entry) =>
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
