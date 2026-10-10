import { toJSON, type SchemaDefinition } from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'

import type { InvalidRestValue } from './field-values.js'

// Built-in output kinds with an exact REST v1 encoding.
const restOutputKinds: ReadonlySet<string> = new Set([
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'object',
	'string',
	'time',
	'uuid',
])

/** @internal Lists the built-in output kinds that have an exact REST v1 encoding. */
export const isRestOutputKind = (kind: string): boolean =>
	restOutputKinds.has(kind)

/** Applies Core's `toJSON`, the one REST v1 value encoding (ADR-0310). */
const encode = (value: unknown, invalid: InvalidRestValue): unknown => {
	try {
		return toJSON(value)
	} catch {
		throw invalid()
	}
}

/**
 * Encodes one Runtime result, a frozen plain object of `schema` (ADR-0310),
 * without inventing fields for absent values.
 */
export const encodeRestSchemaResult = (
	schema: SchemaDefinition,
	value: unknown,
	invalid: InvalidRestValue,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) throw invalid()
	for (const name of Object.keys(value)) {
		if (
			!Object.hasOwn(schema.persistedFields, name) &&
			!Object.hasOwn(schema.virtualFields, name)
		) {
			throw invalid()
		}
	}
	const encoded = encode(value, invalid)
	if (!isPlainRecord(encoded)) throw invalid()
	return encoded
}

/** Revalidates operation wire output before JSON serialization. */
export const encodeRestJsonValue = (
	value: unknown,
	invalid: InvalidRestValue,
): unknown => encode(value, invalid)
