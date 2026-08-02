import { Schema, type SchemaDefinition } from '../../schema/index.js'
import { assertNonEmptyString } from '@ultimabase/shared'

import type { QueryFieldName } from './contracts.js'

/** Validates the minimum trusted schema shape required by every Query boundary. */
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

	return fieldName as QueryFieldName<TSchema>
}
