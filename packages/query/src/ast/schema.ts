import type { SchemaDefinition } from '@ultimabase/schema'
import { assertNonEmptyString, isPlainRecord } from '@ultimabase/shared'

import type { QueryFieldName } from './contracts.js'

/** Validates the minimum trusted schema shape required by every Query boundary. */
export const assertQuerySchemaReference: (
	schema: unknown,
) => asserts schema is SchemaDefinition = (schema) => {
	if (!isPlainRecord(schema)) {
		throw new TypeError('query schema must be a schema definition')
	}

	assertNonEmptyString(schema.className, 'query schema className')

	if (!isPlainRecord(schema.fields)) {
		throw new TypeError('query schema fields must be a field map')
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

	return fieldName as QueryFieldName<TSchema>
}
