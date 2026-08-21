import {
	immutableArray,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import type {
	DatabaseOperationAst,
	ExecutableOperationAst,
	GenericField,
	UpdateExpressionNode,
} from '@ultimabase/core'

import {
	collectFieldLocations,
	collectFieldMapLocations,
	getRuntimeOperationFields,
	type RuntimeFieldInputKind,
	type RuntimeFieldInputLocation,
	type RuntimeFieldInputValue,
	type RuntimeFieldValuePathSegment,
	type RuntimeFieldVisitOrder,
} from './field-input-traversal.js'

interface UpdateOperationValue {
	readonly field: string
	readonly value: unknown
}

/** Reads one normalized update expression without accepting structural guesses. */
const readUpdateOperations = (
	update: UpdateExpressionNode,
): readonly Readonly<Record<string, unknown>>[] => {
	if (
		!isPlainRecord(update) ||
		update.kind !== 'update-expression' ||
		!isUnknownArray(update.operations) ||
		!update.operations.every(isPlainRecord)
	) {
		throw new TypeError('Runtime field inputs require an update expression')
	}

	return update.operations
}

/** Lists every explicitly affected top-level field. */
export const collectUpdateExpressionFieldNames = (
	update: UpdateExpressionNode,
): readonly string[] => {
	const names: string[] = []

	for (const operation of readUpdateOperations(update)) {
		if (typeof operation.field !== 'string') {
			throw new TypeError(
				'Runtime field inputs contain an update without a field name',
			)
		}

		if (!names.includes(operation.field)) names.push(operation.field)
	}

	return immutableArray(names)
}

const readUpdateOperationValue = (
	operation: Readonly<Record<string, unknown>>,
): UpdateOperationValue | undefined => {
	if (
		(operation.kind !== 'relation' &&
			operation.kind !== 'decrement' &&
			operation.kind !== 'increment' &&
			operation.kind !== 'set') ||
		typeof operation.field !== 'string' ||
		!Object.hasOwn(operation, 'value')
	) {
		throw new TypeError(
			'Runtime field inputs contain an invalid update operation',
		)
	}

	return { field: operation.field, value: operation.value }
}

const collectUpdateLocations = (
	update: UpdateExpressionNode,
	fields: Readonly<Record<string, GenericField>>,
	parentOperationPath: readonly RuntimeFieldValuePathSegment[],
	itemIndex: number,
	kind: Extract<
		RuntimeFieldInputKind,
		'update-many' | 'update-one' | 'upsert-many' | 'upsert-one'
	>,
	order: RuntimeFieldVisitOrder,
	locations: RuntimeFieldInputLocation[],
): void => {
	for (const [index, operation] of readUpdateOperations(update).entries()) {
		const updateValue = readUpdateOperationValue(operation)
		if (updateValue === undefined) continue

		const field = fields[updateValue.field]
		if (field === undefined) {
			throw new TypeError(
				`Runtime field inputs reference unknown field ${JSON.stringify(updateValue.field)}`,
			)
		}

		collectFieldLocations(
			field,
			updateValue.value,
			immutableArray([updateValue.field]),
			immutableArray([...parentOperationPath, 'operations', index, 'value']),
			itemIndex,
			kind,
			'update',
			order,
			locations,
		)
	}
}

/** Collects every present candidate value in deterministic item and field order. */
export const collectOperationFieldInputs = (
	operation: DatabaseOperationAst,
	order: RuntimeFieldVisitOrder,
): readonly RuntimeFieldInputValue[] => {
	const fields = getRuntimeOperationFields(operation)
	const executable = operation as unknown as ExecutableOperationAst
	const locations: RuntimeFieldInputLocation[] = []

	switch (executable.kind) {
		case 'create-one':
			collectFieldMapLocations(
				fields,
				executable.input,
				immutableArray([]),
				immutableArray(['input']),
				0,
				executable.kind,
				'create',
				order,
				locations,
			)
			break
		case 'create-many':
			for (const [index, input] of executable.inputs.entries()) {
				collectFieldMapLocations(
					fields,
					input,
					immutableArray([]),
					immutableArray(['inputs', index]),
					index,
					executable.kind,
					'create',
					order,
					locations,
				)
			}
			break
		case 'update-many':
		case 'update-one':
			collectUpdateLocations(
				executable.update,
				fields,
				immutableArray(['update']),
				0,
				executable.kind,
				order,
				locations,
			)
			break
		case 'upsert-one':
			collectFieldMapLocations(
				fields,
				executable.create,
				immutableArray([]),
				immutableArray(['create']),
				0,
				executable.kind,
				'create',
				order,
				locations,
			)
			collectUpdateLocations(
				executable.update,
				fields,
				immutableArray(['update']),
				0,
				executable.kind,
				order,
				locations,
			)
			break
		case 'upsert-many':
			for (const [index, item] of executable.items.entries()) {
				collectFieldMapLocations(
					fields,
					item.create,
					immutableArray([]),
					immutableArray(['items', index, 'create']),
					index,
					executable.kind,
					'create',
					order,
					locations,
				)
				collectUpdateLocations(
					item.update,
					fields,
					immutableArray(['items', index, 'update']),
					index,
					executable.kind,
					order,
					locations,
				)
			}
			break
	}

	return immutableArray(locations)
}
