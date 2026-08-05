import { snapshotScalarFieldValue } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type {
	CompiledPostgresField,
	CompiledPostgresSchema,
} from '../schema/contracts.js'
import { resolveCompiledPostgresField } from '../schema/field.js'

const readPostgresFieldValue = (
	fieldName: string,
	field: CompiledPostgresField,
	value: unknown,
): unknown => {
	if (value === null) {
		if (!field.plan.nullable) {
			throw new TypeError(
				`PostgreSQL required field cannot be null: ${fieldName}`,
			)
		}

		return null
	}

	if (
		field.plan.kind !== 'scalar' ||
		field.storage === 'jsonb' ||
		field.plan.field.kind === 'pointer'
	) {
		// Field-dependent custom columns already apply their complete logical codec.
		return value
	}

	let logicalValue = value

	if (field.plan.field.kind === 'binary') {
		if (!(value instanceof Uint8Array)) {
			throw new TypeError('PostgreSQL binary value must be a byte sequence')
		}

		// Native Drizzle bytea values are Buffers, while Schema exposes detached Uint8Arrays.
		logicalValue = Uint8Array.from(value)
	}

	// Drizzle maps physical types; this read-only guard preserves field-specific
	// invariants such as enum membership and JavaScript safe integers.
	return snapshotScalarFieldValue(
		field.plan.field,
		logicalValue,
		`PostgreSQL field value: ${fieldName}`,
	)
}

const copyPostgresRecord = (
	schema: CompiledPostgresSchema,
	value: unknown,
	rejectUndefined: boolean,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError('PostgreSQL record must be a plain object')
	}

	const copied: Record<string, unknown> = {}

	for (const [fieldName, fieldValue] of Object.entries(value)) {
		if (rejectUndefined && fieldValue === undefined) {
			throw new TypeError(
				`PostgreSQL mutation field cannot be undefined: ${fieldName}`,
			)
		}

		const field = resolveCompiledPostgresField(schema, fieldName)
		copied[fieldName] = rejectUndefined
			? fieldValue
			: readPostgresFieldValue(fieldName, field, fieldValue)
	}

	return immutableRecord(copied)
}

/** Keeps logical mutation values intact for Drizzle's column encoders. */
export const preparePostgresRecord = (
	schema: CompiledPostgresSchema,
	value: unknown,
): Readonly<Record<string, unknown>> => copyPostgresRecord(schema, value, true)

/** Detaches logical values already decoded by Drizzle's columns. */
export const readPostgresRecord = (
	schema: CompiledPostgresSchema,
	value: unknown,
): Readonly<Record<string, unknown>> => copyPostgresRecord(schema, value, false)
