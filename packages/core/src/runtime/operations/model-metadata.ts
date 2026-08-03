import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationOutcome,
} from '../database/contracts.js'
import {
	isNonAtomicBulkOperation,
	readNonAtomicBulkResult,
} from './non-atomic-result.js'

/** Carries identity and projection beside public values rather than inside them. */
export interface RuntimeSchemaModelMetadata {
	readonly objectId: unknown
	readonly selectedFields: readonly string[] | undefined
}

const modelMetadata = new WeakMap<object, RuntimeSchemaModelMetadata>()
const collectionKinds = new Set(['create-many', 'find', 'upsert-many'])
const recordKinds = new Set([
	'create-many',
	'create-one',
	'delete-one',
	'find',
	'first',
	'get',
	'update-one',
	'upsert-many',
	'upsert-one',
])

const collectResultRecords = (
	operation: DatabaseOperationAst,
	result: unknown,
): readonly Readonly<Record<string, unknown>>[] => {
	if (!recordKinds.has(operation.kind) || result === null) {
		return immutableArray([])
	}

	let records: unknown = result

	if (isNonAtomicBulkOperation(operation)) {
		records = readNonAtomicBulkResult(
			result,
			'Runtime protected model metadata',
		).results
	}

	if (collectionKinds.has(operation.kind)) {
		if (!isUnknownArray(records)) {
			return immutableArray([])
		}

		return immutableArray(records.filter(isPlainRecord))
	}

	return isPlainRecord(records) ? immutableArray([records]) : immutableArray([])
}

const collectMutationIdentityRecords = (
	outcome: DatabaseOperationOutcome<DatabaseMutationOperationAst> | undefined,
): readonly Readonly<Record<string, unknown>>[] => {
	if (outcome === undefined) {
		return immutableArray([])
	}

	return immutableArray(
		outcome.materializations.map((materialization) =>
			materialization.kind === 'delete'
				? materialization.previous
				: materialization.current,
		),
	)
}

/** Reads identity through an adapter side channel before falling back to visible id. */
export const collectDatabaseObjectIdentities = (
	executor: DatabaseOperationExecutor,
	operation: DatabaseOperationAst,
	result: unknown,
	outcome?: DatabaseOperationOutcome<DatabaseMutationOperationAst>,
): readonly unknown[] => {
	const mutationRecords = collectMutationIdentityRecords(outcome)
	const records =
		mutationRecords.length > 0
			? mutationRecords
			: collectResultRecords(operation, result)

	return immutableArray(
		records.map((record) => {
			const retained = executor.readObjectIdentity?.(record)

			return retained ?? (Object.hasOwn(record, 'id') ? record.id : undefined)
		}),
	)
}

/** Associates final public records with adapter-proven identity by stable result index. */
export const retainRuntimeSchemaModelMetadata = (
	operation: DatabaseOperationAst,
	objectIdentities: readonly unknown[],
	result: unknown,
	selectedFields: readonly string[] | undefined,
): void => {
	const finalRecords = collectResultRecords(operation, result)
	const selectionSnapshot =
		selectedFields === undefined ? undefined : immutableArray(selectedFields)

	for (const [index, record] of finalRecords.entries()) {
		modelMetadata.set(
			record,
			immutableRecord({
				objectId: objectIdentities[index],
				selectedFields: selectionSnapshot,
			}),
		)
	}
}

/** Reads metadata only for the exact final record retained by Runtime. */
export const readRuntimeSchemaModelMetadata = (
	record: object,
): RuntimeSchemaModelMetadata | undefined => modelMetadata.get(record)

/** Preserves adapter-proven identity when Runtime replaces a record after hooks. */
export const transferRuntimeSchemaModelMetadata = (
	source: object,
	target: object,
): void => {
	const metadata = modelMetadata.get(source)

	if (metadata !== undefined) {
		modelMetadata.set(target, metadata)
	}
}
