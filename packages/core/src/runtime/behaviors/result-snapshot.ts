import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	SchemaDefinition,
	SchemaValidationPlans,
	ValidationIssuePath,
} from '../../schema/index.js'
import type {
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import * as modelMetadata from '../operations/model-metadata.js'
import {
	snapshotRuntimeResultRecord,
	type RuntimeValidationErrorDescription,
} from '../validation/runtime-validation.js'
import { separateRuntimeVirtualResult } from './virtual-result-boundary.js'

export type RuntimeBoundaryIssueThrower = (
	path: ValidationIssuePath,
	message: string,
	description?: Readonly<RuntimeValidationErrorDescription>,
) => never

/** Snapshots one persisted or complete logical output record. */
export const snapshotRuntimeBoundaryRecord = (
	schema: SchemaDefinition,
	plans: SchemaValidationPlans,
	value: unknown,
	path: ValidationIssuePath,
	selectedFields: readonly string[] | undefined,
	description: Readonly<RuntimeValidationErrorDescription>,
	includeVirtuals: boolean,
): Readonly<Record<string, unknown>> => {
	const separated = includeVirtuals
		? separateRuntimeVirtualResult(schema, value, path, selectedFields)
		: undefined
	const snapshot = snapshotRuntimeResultRecord(
		plans,
		separated?.persisted ?? value,
		path,
		selectedFields,
		description,
	)
	if (isPlainRecord(value)) {
		modelMetadata.transferRuntimeSchemaModelMetadata(value, snapshot)
	}
	if (separated === undefined) return snapshot

	const complete = immutableRecord({ ...snapshot, ...separated.virtual })
	modelMetadata.transferRuntimeSchemaModelMetadata(snapshot, complete)
	return complete
}

/** Preserves terminal cardinality while applying the shared record boundary. */
export const snapshotRuntimeBoundaryResult = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	schema: SchemaDefinition,
	value: unknown,
	plans: SchemaValidationPlans,
	selectedFields: readonly string[] | undefined,
	path: ValidationIssuePath,
	description: Readonly<RuntimeValidationErrorDescription>,
	includeVirtuals: boolean,
	throwIssue: RuntimeBoundaryIssueThrower,
): DatabaseOperationResult<TOperation> => {
	if (operation.kind === 'count' || operation.kind === 'exists') {
		const valid =
			operation.kind === 'exists'
				? typeof value === 'boolean'
				: typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
		if (!valid) {
			return throwIssue(
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
		if (
			operation.kind !== 'delete-one' &&
			operation.kind !== 'find-one' &&
			operation.kind !== 'get' &&
			operation.kind !== 'update-one'
		) {
			return throwIssue(path, 'This terminal cannot return null', description)
		}
		return null as DatabaseOperationResult<TOperation>
	}

	if (
		operation.kind === 'create-many' ||
		operation.kind === 'delete-many' ||
		operation.kind === 'find-many' ||
		operation.kind === 'update-many' ||
		operation.kind === 'upsert-many'
	) {
		if (!isUnknownArray(value)) {
			return throwIssue(path, 'This terminal must return an array', description)
		}
		return immutableArray(
			value.map((item, index) =>
				snapshotRuntimeBoundaryRecord(
					schema,
					plans,
					item,
					[...path, index],
					selectedFields,
					description,
					includeVirtuals,
				),
			),
		) as DatabaseOperationResult<TOperation>
	}

	return snapshotRuntimeBoundaryRecord(
		schema,
		plans,
		value,
		path,
		selectedFields,
		description,
		includeVirtuals,
	) as DatabaseOperationResult<TOperation>
}
