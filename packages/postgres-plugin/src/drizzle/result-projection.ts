import type {
	DatabaseLogicalRecord,
	ExecutableOperationAst,
	NonAtomicBulkResult,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

type PostgresProjectedMutationOperation = Extract<
	ExecutableOperationAst,
	{
		readonly kind:
			| 'create-many'
			| 'create-one'
			| 'delete-one'
			| 'update-one'
			| 'upsert-many'
			| 'upsert-one'
	}
>

type PostgresProjectedBulkMutationOperation = Extract<
	PostgresProjectedMutationOperation,
	{ readonly kind: 'create-many' | 'upsert-many' }
>

/** Keeps full private records separate from one normalized public projection. */
export const projectPostgresRecord = (
	record: DatabaseLogicalRecord,
	operation: PostgresProjectedMutationOperation,
): DatabaseLogicalRecord => {
	const selection =
		operation.kind === 'create-one' ||
		operation.kind === 'create-many' ||
		operation.kind === 'upsert-many'
			? operation.selection
			: operation.query.selection

	if (selection.fields.length === 0) {
		return record
	}

	const projection: Record<string, unknown> = {}

	for (const { field } of selection.fields) {
		if (!Object.hasOwn(record, field)) {
			throw new TypeError(
				`PostgreSQL prepared mutation result is missing selected field: ${field}`,
			)
		}

		projection[field] = record[field]
	}

	return immutableRecord(projection)
}

/** Projects an atomic collection without altering its full private materializations. */
export const projectPostgresRecords = (
	records: readonly DatabaseLogicalRecord[],
	operation: PostgresProjectedBulkMutationOperation,
): readonly DatabaseLogicalRecord[] =>
	immutableArray(
		records.map((record) => projectPostgresRecord(record, operation)),
	)

/** Projects only the visible prefix of one non-atomic collection result. */
export const projectPostgresNonAtomicResult = (
	result: NonAtomicBulkResult<DatabaseLogicalRecord>,
	operation: PostgresProjectedBulkMutationOperation,
): NonAtomicBulkResult<DatabaseLogicalRecord> =>
	result.status === 'completed'
		? immutableRecord({
				results: projectPostgresRecords(result.results, operation),
				status: result.status,
			})
		: immutableRecord({
				error: result.error,
				failedIndex: result.failedIndex,
				results: projectPostgresRecords(result.results, operation),
				status: result.status,
			})
