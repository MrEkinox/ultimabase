import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import {
	snapshotOutputValue,
	type SchemaDefinition,
	type SchemaValidationPlans,
	type ValidationIssuePath,
} from '../../schema/index.js'
import type {
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import { transferRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import {
	isCollectionOperationResult,
	isNullableOperationResult,
} from '../operations/characteristics.js'
import {
	snapshotRuntimeResultRecord,
	type RuntimeValidationErrorDescription,
} from '../validation/runtime-validation.js'
import { throwBoundaryIssue } from './validation-boundary-helpers.js'

type LogicalRecord = Readonly<Record<string, unknown>>

/** Separates and snapshots virtual values before persisted record validation. */
const separateVirtualResult = (
	schema: SchemaDefinition,
	value: LogicalRecord,
	path: ValidationIssuePath,
	selectedFields: readonly string[] | undefined,
): Readonly<{ persisted: LogicalRecord; virtual: LogicalRecord }> => {
	const selected =
		selectedFields === undefined ? undefined : new Set(selectedFields)
	const persisted: Record<string, unknown> = { ...value }
	const virtual: Record<string, unknown> = {}

	for (const name of Object.keys(schema.virtualFields)) {
		if (!Object.hasOwn(value, name)) continue
		Reflect.deleteProperty(persisted, name)
		if (selected !== undefined && !selected.has(name)) {
			throwBoundaryIssue(
				[...path, name],
				'Virtual field is not part of this result projection',
			)
		}
	}

	for (const [name, field] of Object.entries(schema.virtualFields)) {
		if (selected !== undefined && !selected.has(name)) continue
		if (!Object.hasOwn(value, name)) {
			throwBoundaryIssue([...path, name], 'Requested virtual field is missing')
		}
		try {
			virtual[name] = snapshotOutputValue(
				field.output,
				value[name],
				`${schema.className}.${name}`,
			)
		} catch (error: unknown) {
			throw new FrameworkError(
				'VALIDATION_ERROR',
				`Runtime behavior returned an invalid virtual field: ${schema.className}.${name}`,
				{
					cause: error,
					publicMessage: 'A Runtime behavior returned an invalid value.',
					internalDetails: { className: schema.className, field: name },
				},
			)
		}
	}

	return immutableRecord({
		persisted: immutableRecord(persisted),
		virtual: immutableRecord(virtual),
	})
}

/** Snapshots one persisted or complete logical output record. */
export const snapshotRuntimeBoundaryRecord = (
	schema: SchemaDefinition,
	plans: SchemaValidationPlans,
	value: unknown,
	path: ValidationIssuePath,
	selectedFields: readonly string[] | undefined,
	description: Readonly<RuntimeValidationErrorDescription>,
	includeVirtuals: boolean,
): LogicalRecord => {
	const separated =
		includeVirtuals && isPlainRecord(value)
			? separateVirtualResult(schema, value, path, selectedFields)
			: undefined
	const snapshot = snapshotRuntimeResultRecord(
		plans,
		separated?.persisted ?? value,
		path,
		selectedFields,
		description,
	)
	if (isPlainRecord(value)) {
		transferRuntimeSchemaModelMetadata(value, snapshot)
	}
	if (separated === undefined) return snapshot

	const complete = immutableRecord({ ...snapshot, ...separated.virtual })
	transferRuntimeSchemaModelMetadata(snapshot, complete)
	return complete
}

/** Preserves terminal cardinality while applying one record boundary per item. */
export const snapshotRuntimeBoundaryResult = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	value: unknown,
	path: ValidationIssuePath,
	description: Readonly<RuntimeValidationErrorDescription>,
	snapshotRecord: (value: unknown, path: ValidationIssuePath) => LogicalRecord,
): DatabaseOperationResult<TOperation> => {
	if (operation.kind === 'count' || operation.kind === 'exists') {
		const valid =
			operation.kind === 'exists'
				? typeof value === 'boolean'
				: typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
		if (!valid) {
			return throwBoundaryIssue(
				path,
				operation.kind === 'exists'
					? 'Exists result must be a boolean'
					: 'Count result must be a non-negative safe integer',
				description,
			)
		}
		return value as DatabaseOperationResult<TOperation>
	}

	if (value === null) {
		if (!isNullableOperationResult(operation.kind)) {
			return throwBoundaryIssue(
				path,
				'This terminal cannot return null',
				description,
			)
		}
		return null as DatabaseOperationResult<TOperation>
	}

	if (isCollectionOperationResult(operation.kind)) {
		if (!isUnknownArray(value)) {
			return throwBoundaryIssue(
				path,
				'This terminal must return an array',
				description,
			)
		}
		return immutableArray(
			value.map((item, index) => snapshotRecord(item, [...path, index])),
		) as DatabaseOperationResult<TOperation>
	}

	return snapshotRecord(value, path) as DatabaseOperationResult<TOperation>
}
