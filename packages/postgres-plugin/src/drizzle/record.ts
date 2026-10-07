import {
	snapshotScalarFieldValue,
	type DatabaseLogicalRecord,
	type QuerySelectionNode,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	resolveCompiledPostgresField,
	type CompiledPostgresField,
	type CompiledPostgresSchema,
} from '../schema/contracts.js'

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
	direction: 'prepare' | 'read',
): DatabaseLogicalRecord => {
	if (!isPlainRecord(value)) {
		throw new TypeError('PostgreSQL record must be a plain object')
	}

	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([fieldName, fieldValue]) => {
				if (direction === 'prepare' && fieldValue === undefined) {
					throw new TypeError(
						`PostgreSQL mutation field cannot be undefined: ${fieldName}`,
					)
				}

				const field = resolveCompiledPostgresField(schema, fieldName)

				return [
					fieldName,
					direction === 'prepare'
						? fieldValue
						: readPostgresFieldValue(fieldName, field, fieldValue),
				]
			}),
		),
	)
}

/** Keeps logical mutation values intact for Drizzle's column encoders. */
export const preparePostgresRecord = (
	schema: CompiledPostgresSchema,
	value: unknown,
): DatabaseLogicalRecord => copyPostgresRecord(schema, value, 'prepare')

/** Detaches logical values already decoded by Drizzle's columns. */
export const readPostgresRecord = (
	schema: CompiledPostgresSchema,
	value: unknown,
): DatabaseLogicalRecord => copyPostgresRecord(schema, value, 'read')

/** Keeps full private records separate from one exact returning projection. */
export const projectPostgresRecord = (
	record: DatabaseLogicalRecord,
	selection: QuerySelectionNode,
	missingField = 'PostgreSQL prepared mutation result is missing selected field',
): DatabaseLogicalRecord =>
	selection.fields.length === 0
		? record
		: immutableRecord(
				Object.fromEntries(
					selection.fields.map(({ field }) => {
						if (!Object.hasOwn(record, field)) {
							throw new TypeError(`${missingField}: ${field}`)
						}

						return [field, record[field]]
					}),
				),
			)

/** Projects an atomic collection without altering its full private materializations. */
export const projectPostgresRecords = (
	records: readonly DatabaseLogicalRecord[],
	selection: QuerySelectionNode,
): readonly DatabaseLogicalRecord[] =>
	immutableArray(
		records.map((record) => projectPostgresRecord(record, selection)),
	)
