import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { Schema, type SchemaDefinition } from './definition.js'
import type { SchemaPreparedDraft, SchemaResult } from './model-contracts.js'

// Results stay plain objects (ADR-0310); Core only remembers which ones it made.
const schemaResults = new WeakSet<object>()

const snapshotValues = (
	schema: SchemaDefinition,
	values: unknown,
	label: 'Persisted' | 'Prepared draft',
): Readonly<Record<string, unknown>> => {
	if (!Schema.is(schema)) {
		throw new TypeError(
			'Schema model class was not created by App.Schema.define',
		)
	}
	if (!isPlainRecord(values)) {
		throw new TypeError(`${label} schema values must be a plain object`)
	}
	for (const key of Reflect.ownKeys(values)) {
		if (typeof key !== 'string' || !Object.hasOwn(schema.fields, key)) {
			throw new TypeError(
				`${label} schema values contain an unknown field: ${String(key)}`,
			)
		}
	}
	// Runtime already validated and deeply detached every visible logical value.
	return immutableRecord(values)
}

/** Freezes one complete pre-persistence candidate as plain data. */
export const materializePreparedSchemaDraft = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	values: unknown,
): SchemaPreparedDraft<TSchema> =>
	// The keys were checked against this schema; the values are Runtime's.
	snapshotValues(
		schema,
		values,
		'Prepared draft',
	) as SchemaPreparedDraft<TSchema>

/**
 * Freezes one final Runtime record as a plain result object (ADR-0310): its
 * prototype is `Object.prototype` and it has no methods.
 */
export const materializeSchemaModel = <
	const TSchema extends SchemaDefinition,
	const TValues extends object,
>(
	schema: TSchema,
	values: TValues,
): SchemaResult<TSchema, TValues> => {
	const result = snapshotValues(schema, values, 'Persisted')
	schemaResults.add(result)
	// The keys were checked against this schema; the values are `TValues`.
	return result as SchemaResult<TSchema, TValues>
}

/** @internal Tells whether Core materialized this value as a schema result. */
export const isSchemaResult = (value: unknown): boolean =>
	typeof value === 'object' && value !== null && schemaResults.has(value)
