import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { sql } from 'drizzle-orm'

import {
	resolveCompiledPostgresField,
	type CompiledPostgresSchema,
} from '../schema/contracts.js'

/** Compiles one Runtime-normalized atomic update into Drizzle set values. */
export const compilePostgresUpdate = (
	schema: CompiledPostgresSchema,
	value: unknown,
): Readonly<Record<string, unknown>> => {
	if (
		!isPlainRecord(value) ||
		value.kind !== 'update-expression' ||
		!isUnknownArray(value.operations) ||
		value.operations.length === 0
	) {
		throw new TypeError('PostgreSQL update expression is invalid')
	}

	const fields = new Set<string>()
	const compiled: [string, unknown][] = []

	for (const operation of value.operations) {
		if (
			!isPlainRecord(operation) ||
			typeof operation.field !== 'string' ||
			fields.has(operation.field)
		) {
			throw new TypeError('PostgreSQL update operation is invalid')
		}

		const fieldName = operation.field

		fields.add(fieldName)

		// Relation storage is handled separately while scalar system updates remain here.
		if (operation.kind === 'relation') continue

		const column = resolveCompiledPostgresField(schema, fieldName).column

		if (
			operation.kind !== 'set' &&
			operation.kind !== 'increment' &&
			operation.kind !== 'decrement'
		) {
			throw new TypeError(
				`Unsupported PostgreSQL update operation: ${String(operation.kind)}`,
			)
		}

		if (!Object.hasOwn(operation, 'value')) {
			throw new TypeError(
				operation.kind === 'set'
					? 'PostgreSQL set operation requires a value'
					: 'PostgreSQL numeric operation requires a value',
			)
		}

		if (operation.kind === 'set') {
			compiled.push([fieldName, operation.value])
			continue
		}

		const operand = sql.param(operation.value, column)

		compiled.push([
			fieldName,
			operation.kind === 'increment'
				? sql`${column} + ${operand}`
				: sql`${column} - ${operand}`,
		])
	}

	return immutableRecord(Object.fromEntries(compiled))
}
