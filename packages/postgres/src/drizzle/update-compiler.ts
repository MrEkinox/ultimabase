import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { sql } from 'drizzle-orm'

import type { CompiledPostgresSchema } from '../schema/contracts.js'
import { resolveCompiledPostgresField } from '../schema/field.js'

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

	const compiled: Record<string, unknown> = {}
	const fields = new Set<string>()

	for (const operation of value.operations) {
		if (
			!isPlainRecord(operation) ||
			typeof operation.field !== 'string' ||
			fields.has(operation.field)
		) {
			throw new TypeError('PostgreSQL update operation is invalid')
		}

		const fieldName = operation.field
		const field = resolveCompiledPostgresField(schema, fieldName)

		fields.add(fieldName)

		switch (operation.kind) {
			case 'set':
				if (!Object.hasOwn(operation, 'value')) {
					throw new TypeError('PostgreSQL set operation requires a value')
				}
				compiled[fieldName] = field.codec.encode(operation.value)
				break
			case 'unset':
				compiled[fieldName] = null
				break
			case 'increment':
			case 'decrement': {
				if (!Object.hasOwn(operation, 'value')) {
					throw new TypeError('PostgreSQL numeric operation requires a value')
				}

				const operand = field.codec.encode(operation.value)

				compiled[fieldName] =
					operation.kind === 'increment'
						? sql`${field.column} + ${operand}`
						: sql`${field.column} - ${operand}`
				break
			}
			default:
				throw new TypeError(
					`Unsupported PostgreSQL update operation: ${String(operation.kind)}`,
				)
		}
	}

	return immutableRecord(compiled)
}
