import type {
	DatabaseLogicalRecord,
	ExecutableOperationAst,
	QuerySelectionNode,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

type PostgresProjectedMutationOperation = Extract<
	ExecutableOperationAst,
	{
		readonly kind:
			| 'create-many'
			| 'create-one'
			| 'delete-many'
			| 'delete-one'
			| 'update-many'
			| 'update-one'
			| 'upsert-many'
			| 'upsert-one'
	}
>

/** Reads the public selection only when no private returning plan replaces it. */
const readPostgresMutationResultSelection = (
	operation: PostgresProjectedMutationOperation,
): QuerySelectionNode =>
	operation.kind === 'create-one' ||
	operation.kind === 'create-many' ||
	operation.kind === 'upsert-many'
		? operation.selection
		: operation.query.selection

/** Keeps full private records separate from one exact returning projection. */
export const projectPostgresRecord = (
	record: DatabaseLogicalRecord,
	source: PostgresProjectedMutationOperation | QuerySelectionNode,
): DatabaseLogicalRecord => {
	const selection =
		source.kind === 'selection'
			? source
			: readPostgresMutationResultSelection(source)
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
	selection: QuerySelectionNode,
): readonly DatabaseLogicalRecord[] =>
	immutableArray(
		records.map((record) => projectPostgresRecord(record, selection)),
	)
