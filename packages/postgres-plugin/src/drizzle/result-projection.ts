import type {
	DatabaseLogicalRecord,
	ExecutableOperationAst,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

type PostgresProjectedMutationOperation = Extract<
	ExecutableOperationAst,
	{
		readonly kind: 'create-one' | 'delete-one' | 'update-one' | 'upsert-one'
	}
>

/** Keeps full private records separate from one normalized public projection. */
export const projectPostgresRecord = (
	record: DatabaseLogicalRecord,
	operation: PostgresProjectedMutationOperation,
): DatabaseLogicalRecord => {
	const selection =
		operation.kind === 'create-one'
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
