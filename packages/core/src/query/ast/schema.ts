import { Schema, type SchemaDefinition } from '../../schema/index.js'
import { assertNonEmptyString, isPlainRecord } from '@ultimabase/shared'

import type { QueryFieldName } from './contracts.js'

/** Validates the minimum trusted schema shape required by every QueryBuilder boundary. */
export const assertQuerySchemaReference: (
	schema: unknown,
) => asserts schema is SchemaDefinition = (schema) => {
	if (!Schema.is(schema)) {
		throw new TypeError('query schema must be a schema definition')
	}
}

/** Returns an untrusted field name only after matching the exact schema field map. */
export const parseQueryFieldName = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: unknown,
	path: string,
): QueryFieldName<TSchema> => {
	assertNonEmptyString(fieldName, path)

	if (!Object.hasOwn(schema.fields, fieldName)) {
		throw new TypeError(`${path} must reference a schema field`)
	}

	return fieldName
}

/** Reads the persisted map while retaining diagnostics for forged legacy shapes. */
export const readPersistedQueryFields = (
	schema: SchemaDefinition,
): SchemaDefinition['persistedFields'] => {
	const persistedFields: unknown = Reflect.get(schema, 'persistedFields')
	return isPlainRecord(persistedFields)
		? (persistedFields as SchemaDefinition['persistedFields'])
		: schema.fields
}

/** Returns a field name only when it belongs to the persisted schema surface. */
export const parsePersistedQueryFieldName = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: unknown,
	path: string,
): QueryFieldName<TSchema> => {
	assertNonEmptyString(fieldName, path)

	if (!Object.hasOwn(readPersistedQueryFields(schema), fieldName)) {
		throw new TypeError(`${path} must reference a schema field`)
	}

	return fieldName
}
