import type { PgColumn } from 'drizzle-orm/pg-core'
import { immutableRecord } from '@ultimabase/shared'

import type {
	CompiledPostgresField,
	CompiledPostgresSchema,
} from './contracts.js'

/** Resolves one compiled field through the shared adapter invariant. */
export const resolveCompiledPostgresField = (
	schema: CompiledPostgresSchema,
	fieldName: string,
): CompiledPostgresField => {
	const field = schema.fields[fieldName]

	if (field === undefined) {
		throw new TypeError(
			`PostgreSQL query references missing field: ${fieldName}`,
		)
	}

	return field
}

/** Builds a Drizzle projection keyed by logical UltimaBase field names. */
export const compilePostgresSelection = (
	schema: CompiledPostgresSchema,
	fieldNames: readonly string[] = Object.keys(schema.fields),
): Readonly<Record<string, PgColumn>> => {
	const selection: Record<string, PgColumn> = {}

	for (const fieldName of fieldNames) {
		selection[fieldName] = resolveCompiledPostgresField(
			schema,
			fieldName,
		).column
	}

	return immutableRecord(selection)
}
