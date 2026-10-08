import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QuerySelectionNode } from '../../query/index.js'
import { normalizeQuerySelectedFields } from '../../query/clauses/selection.js'
import {
	Schema,
	type GenericVirtualField,
	type SchemaContributionProvenance,
	type SchemaDefinition,
} from '../../schema/index.js'
import type {
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import { transferRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import { isRecordOperationResult } from '../operations/characteristics.js'
import { readOperationResultSelection } from '../operations/queries.js'
import { getOperationSchema } from '../operations/schema.js'
import { assertPlainObject } from '../../exact-object-validation.js'

/** Separates one authorized logical projection from its private persisted superset. */
export interface RuntimeVirtualFieldProjection {
	readonly persistedSelection: QuerySelectionNode
	readonly publicPersistedFields: readonly string[]
	readonly schema: SchemaDefinition
	readonly virtualFields: readonly Readonly<{
		readonly field: GenericVirtualField
		readonly name: string
		readonly provenance: SchemaContributionProvenance
	}>[]
}

/** Compiles private dependencies only after protected selection enforcement. */
export const prepareRuntimeVirtualFieldProjection = (
	operation: DatabaseOperationAst,
): RuntimeVirtualFieldProjection | undefined => {
	if (!isRecordOperationResult(operation.kind)) return undefined

	const schema = getOperationSchema(operation)
	if (!Schema.is(schema)) {
		throw new TypeError('Runtime virtual projection schema is invalid')
	}

	const selection = readOperationResultSelection(operation)
	const requested =
		selection.fields.length === 0
			? new Set(Object.keys(schema.fields))
			: new Set(selection.fields.map(({ field }) => field))
	const publicPersistedFields = Object.entries(schema.persistedFields)
		.filter(([, field]) => field.kind !== 'relation')
		.map(([name]) => name)
		.filter((name) => requested.has(name))
	const virtualFields = Object.entries(schema.virtualFields)
		.filter(([name]) => requested.has(name))
		.map(([name, field]) => {
			const provenance = schema.provenance.fields[name]
			if (provenance === undefined) {
				throw new TypeError(
					`Runtime virtual field provenance is missing: ${schema.className}.${name}`,
				)
			}

			return immutableRecord({ field, name, provenance })
		})

	if (virtualFields.length === 0) return undefined

	const required = new Set(publicPersistedFields)
	for (const { field } of virtualFields) {
		for (const dependency of field.select) required.add(dependency)
	}
	const persistedFields = Object.entries(schema.persistedFields)
		.filter(([, field]) => field.kind !== 'relation')
		.map(([name]) => name)
		.filter((name) => required.has(name))

	return immutableRecord({
		persistedSelection: normalizeQuerySelectedFields(schema, persistedFields),
		publicPersistedFields: immutableArray(publicPersistedFields),
		schema,
		virtualFields: immutableArray(virtualFields),
	})
}

const projectRecord = (
	record: Readonly<Record<string, unknown>>,
	fields: readonly string[],
): Readonly<Record<string, unknown>> => {
	const permitted = new Set(fields)
	const projected = immutableRecord(
		Object.fromEntries(
			Object.entries(record).filter(([name]) => permitted.has(name)),
		),
	)
	transferRuntimeSchemaModelMetadata(record, projected)
	return projected
}

/** Removes dependency-only values before any public result behavior can observe them. */
export const projectRuntimePublicPersistedResult = <
	const TOperation extends DatabaseOperationAst,
>(
	projection: RuntimeVirtualFieldProjection,
	result: unknown,
): DatabaseOperationResult<TOperation> => {
	if (result === null) return result as DatabaseOperationResult<TOperation>
	const candidate: unknown = result

	if (isUnknownArray(candidate)) {
		return immutableArray(
			candidate.map((record) => {
				if (!isPlainRecord(record)) {
					throw new TypeError(
						'Runtime virtual collection source must be records',
					)
				}
				return projectRecord(record, projection.publicPersistedFields)
			}),
		) as DatabaseOperationResult<TOperation>
	}

	assertPlainObject(candidate, 'Runtime virtual source must be a record')

	return projectRecord(
		candidate,
		projection.publicPersistedFields,
	) as DatabaseOperationResult<TOperation>
}
