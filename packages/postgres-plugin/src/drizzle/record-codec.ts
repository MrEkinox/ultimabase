import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { CompiledPostgresSchema } from '../schema/contracts.js'
import { resolveCompiledPostgresField } from '../schema/field.js'

/** Encodes one Runtime-validated object without inventing missing database values. */
export const encodePostgresRecord = (
	schema: CompiledPostgresSchema,
	value: unknown,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError('PostgreSQL mutation input must be a plain object')
	}

	const encoded: Record<string, unknown> = {}

	for (const [fieldName, fieldValue] of Object.entries(value)) {
		if (fieldValue === undefined) {
			throw new TypeError(
				`PostgreSQL mutation field cannot be undefined: ${fieldName}`,
			)
		}

		encoded[fieldName] = resolveCompiledPostgresField(
			schema,
			fieldName,
		).codec.encode(fieldValue)
	}

	return immutableRecord(encoded)
}

/** Decodes selected driver values through the same field codecs used by writes. */
export const decodePostgresRecord = (
	schema: CompiledPostgresSchema,
	value: unknown,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError('PostgreSQL result row must be a plain object')
	}

	const decoded: Record<string, unknown> = {}

	for (const [fieldName, fieldValue] of Object.entries(value)) {
		const field = resolveCompiledPostgresField(schema, fieldName)

		if (fieldValue === null && !field.plan.nullable && !field.column.notNull) {
			// PostgreSQL NULL represents absence for an optional non-nullable field.
			continue
		}

		decoded[fieldName] = field.codec.decode(fieldValue)
	}

	return immutableRecord(decoded)
}
