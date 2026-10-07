import { immutableRecord } from '@ultimabase/shared'

import type { OperationExecutionOwnerToken } from '../../query/operations/execution.js'
import type { SchemaDefinition } from './definition.js'
import type { SchemaModelState } from './model-contracts.js'

export interface SchemaModelRecord {
	readonly objectId: unknown
	readonly ownerToken?: OperationExecutionOwnerToken
	readonly schema: SchemaDefinition
	readonly selectedFields: readonly string[] | undefined
	readonly state: SchemaModelState
	readonly values: Readonly<Record<string, unknown>>
}

export const persistedModelConstructionKey: unique symbol = Symbol(
	'ultimabase.persisted-schema-model-construction',
)
export const preparedDraftConstructionKey: unique symbol = Symbol(
	'ultimabase.prepared-draft-schema-model-construction',
)
const schemaModelRecords = new WeakMap<object, SchemaModelRecord>()
const schemaModelClasses = new WeakSet<SchemaDefinition>()

/** Retains one immutable private lifecycle record for a generated model shell. */
export const retainSchemaModelRecord = (
	instance: object,
	record: SchemaModelRecord,
): void => {
	schemaModelRecords.set(instance, immutableRecord(record))
}

/** Retains one model's trusted identity on an immutable application-owned Proxy. */
export const retainSchemaModelAlias = (alias: object, model: object): void => {
	const record = schemaModelRecords.get(model)

	if (record === undefined) {
		throw new TypeError('Schema model alias requires trusted model state')
	}

	schemaModelRecords.set(alias, record)
}

/** Attaches only inert lifecycle provenance to one Runtime-materialized result. */
export const retainSchemaModelOwner = (
	model: object,
	ownerToken: OperationExecutionOwnerToken,
): void => {
	const record = schemaModelRecords.get(model)
	if (record === undefined) {
		throw new TypeError('Schema model owner requires trusted model state')
	}
	if (record.ownerToken !== undefined && record.ownerToken !== ownerToken) {
		throw new TypeError('Schema model cannot be rebound to another application')
	}
	if (record.ownerToken === ownerToken) return
	schemaModelRecords.set(model, immutableRecord({ ...record, ownerToken }))
}

/** Registers the exact generated constructor accepted by Runtime materialization. */
export const registerSchemaModelClass = (schema: SchemaDefinition): void => {
	schemaModelClasses.add(schema)
}

/** Checks constructor provenance without exposing the private registry. */
export const isSchemaModelClassRegistered = (
	schema: SchemaDefinition,
): boolean => schemaModelClasses.has(schema)

export const readSchemaModelRecord = (instance: object): SchemaModelRecord => {
	const record = schemaModelRecords.get(instance)

	if (record === undefined) {
		throw new TypeError('Schema model instance has no trusted model state')
	}

	return record
}

/** Reads optional trusted state for identity comparisons that must return false. */
export const findSchemaModelRecord = (
	instance: object,
): SchemaModelRecord | undefined => schemaModelRecords.get(instance)

export const assertSchemaModelState = (
	record: SchemaModelRecord,
	expected: SchemaModelState,
	command: string,
): void => {
	if (record.state !== expected) {
		throw new TypeError(
			`Schema model ${command} requires ${expected} model state`,
		)
	}
}

export const readPersistedSchemaModelRecord = (
	instance: object,
	command: string,
): SchemaModelRecord & { readonly objectId: unknown } => {
	const record = readSchemaModelRecord(instance)

	assertSchemaModelState(record, 'persisted', command)

	if (record.objectId === undefined) {
		throw new TypeError(
			`Schema model ${command} requires protected persisted identity`,
		)
	}

	return record
}

/** Checks trusted instance provenance without exposing private model state. */
export const isSchemaModelInstance = (
	schema: SchemaDefinition,
	value: unknown,
): boolean => {
	if (typeof value !== 'object' || value === null) {
		return false
	}

	return schemaModelRecords.get(value)?.schema === schema
}
