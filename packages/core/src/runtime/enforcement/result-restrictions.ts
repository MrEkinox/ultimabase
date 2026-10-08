import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { narrowRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import { readOperationResultInclusion } from '../operations/queries.js'
import type {
	RuntimeLogicalOperationAst,
	RuntimeDatabaseResultStageInput,
	RuntimeResultStageInput,
} from '../pipeline/contracts.js'
import { getEnforcementStateSnapshot, type EnforcementState } from './state.js'

/** Applies one final projection to plain adapter result records only. */
const restrictResultRecord = (
	result: Readonly<Record<string, unknown>>,
	permittedFields: readonly string[],
): Readonly<Record<string, unknown>> => {
	const entries = Object.entries(result).filter(([field]) =>
		permittedFields.includes(field),
	)
	const restricted = immutableRecord(Object.fromEntries(entries))

	narrowRuntimeSchemaModelMetadata(result, restricted, permittedFields)

	return restricted
}

const restrictResult = <const TResult>(
	result: TResult,
	permittedFields: readonly string[] | undefined,
): TResult => {
	if (permittedFields === undefined || result === null) {
		return result
	}

	const unknownResult: unknown = result

	if (isUnknownArray(unknownResult)) {
		return immutableArray(
			unknownResult.map((record) =>
				isPlainRecord(record)
					? restrictResultRecord(record, permittedFields)
					: record,
			),
		) as TResult
	}

	return (
		isPlainRecord(unknownResult)
			? restrictResultRecord(unknownResult, permittedFields)
			: result
	) as TResult
}

/** Hides selection-restricted fields before any output behavior can observe them. */
export const enforceSelectionResultRestrictions = <
	const TOperation extends RuntimeLogicalOperationAst,
	const TResult,
>(
	input: RuntimeDatabaseResultStageInput<TOperation, TResult> & {
		readonly enforcement: EnforcementState
	},
): TResult => {
	const snapshot = getEnforcementStateSnapshot(input.enforcement)

	return restrictResult(input.result, snapshot.selectionFields)
}

/** Reapplies the selection restriction after business result replacement. */
export const enforceOutputRestrictions = <
	const TOperation extends RuntimeLogicalOperationAst,
	const TResult,
>(
	input: RuntimeResultStageInput<TOperation, TResult> & {
		readonly enforcement: EnforcementState
	},
): TResult => {
	const permittedFields = getEnforcementStateSnapshot(
		input.enforcement,
	).selectionFields
	if (permittedFields === undefined) return input.result

	// Relationship inclusions are a separately validated output projection and
	// never enter the physical scalar selection narrowed by policy providers.
	const inclusionFields = readOperationResultInclusion(
		input.operation,
	).fields.map(({ field }) => field)
	const permittedResultFields = immutableArray([
		...permittedFields,
		...inclusionFields.filter((field) => !permittedFields.includes(field)),
	])

	return restrictResult(input.result, permittedResultFields)
}
