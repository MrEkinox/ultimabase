import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import type {
	ExecutableOperationAst,
	UpdateExpressionNode,
} from '../../query/index.js'
import type {
	FieldHookMode,
	FieldInputHookKind,
} from '../../schema/hooks/field-contracts.js'
import { Schema, type GenericField } from '../../schema/index.js'
import { getFieldListDepth } from '../../schema/fields/base/options.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'

export type RuntimeFieldValuePathSegment = number | string
export type RuntimeFieldVisitOrder = 'children-first' | 'parent-first'

/** Identifies one present logical field value without flattening structural paths. */
export interface RuntimeFieldValue {
	readonly field: GenericField
	readonly fieldPath: readonly string[]
	readonly value: unknown
	readonly valuePath: readonly RuntimeFieldValuePathSegment[]
}

/** Correlates one present field value with its exact mutation candidate. */
export interface RuntimeFieldInputValue extends RuntimeFieldValue {
	readonly itemIndex: number
	readonly kind: FieldInputHookKind
	readonly mode: Extract<FieldHookMode, 'create' | 'update'>
}

export type RuntimeFieldInputVisitor = (
	input: RuntimeFieldInputValue,
) => MaybePromise<unknown>

type RuntimeFieldInputLocation = RuntimeFieldInputValue

interface RuntimeObjectField extends GenericField {
	readonly kind: 'object'
	readonly options: Readonly<{
		readonly fields: Readonly<Record<string, GenericField>>
	}>
}

interface UpdateOperationValue {
	readonly field: string
	readonly value: unknown
}

const isRuntimeObjectField = (
	field: GenericField,
): field is RuntimeObjectField =>
	field.kind === 'object' &&
	'fields' in field.options &&
	isPlainRecord(field.options.fields)

/** Recovers one validated schema field map from either operation AST shape. */
export const getRuntimeOperationFields = (
	operation: DatabaseOperationAst,
): Readonly<Record<string, GenericField>> => {
	const schema = getOperationSchema(operation)

	if (!Schema.is(schema)) {
		throw new TypeError('Runtime field traversal requires a declared schema')
	}

	return schema.fields
}

/** Adds one immutable visit descriptor at the requested traversal position. */
const appendFieldLocation = (
	locations: RuntimeFieldInputLocation[],
	field: GenericField,
	fieldPath: readonly string[],
	operationPath: readonly RuntimeFieldValuePathSegment[],
	itemIndex: number,
	kind: FieldInputHookKind,
	mode: Extract<FieldHookMode, 'create' | 'update'>,
	value: unknown,
): void => {
	locations.push(
		immutableRecord({
			field,
			fieldPath: immutableArray(fieldPath),
			itemIndex,
			kind,
			mode,
			value,
			valuePath: immutableArray(operationPath),
		}),
	)
}

const collectFieldLocations = (
	field: GenericField,
	value: unknown,
	fieldPath: readonly string[],
	operationPath: readonly RuntimeFieldValuePathSegment[],
	itemIndex: number,
	kind: FieldInputHookKind,
	mode: Extract<FieldHookMode, 'create' | 'update'>,
	order: RuntimeFieldVisitOrder,
	locations: RuntimeFieldInputLocation[],
): void => {
	if (order === 'parent-first') {
		appendFieldLocation(
			locations,
			field,
			fieldPath,
			operationPath,
			itemIndex,
			kind,
			mode,
			value,
		)
	}

	if (isRuntimeObjectField(field)) {
		collectObjectChildLocations(
			field,
			value,
			fieldPath,
			operationPath,
			itemIndex,
			kind,
			mode,
			order,
			locations,
		)
	}

	if (order === 'children-first') {
		appendFieldLocation(
			locations,
			field,
			fieldPath,
			operationPath,
			itemIndex,
			kind,
			mode,
			value,
		)
	}
}

const collectFieldMapLocations = (
	fields: Readonly<Record<string, GenericField>>,
	value: Readonly<Record<string, unknown>>,
	parentFieldPath: readonly string[],
	parentOperationPath: readonly RuntimeFieldValuePathSegment[],
	itemIndex: number,
	kind: FieldInputHookKind,
	mode: Extract<FieldHookMode, 'create' | 'update'>,
	order: RuntimeFieldVisitOrder,
	locations: RuntimeFieldInputLocation[],
): void => {
	for (const [name, field] of Object.entries(fields)) {
		if (!Object.hasOwn(value, name)) {
			continue
		}

		collectFieldLocations(
			field,
			value[name],
			immutableArray([...parentFieldPath, name]),
			immutableArray([...parentOperationPath, name]),
			itemIndex,
			kind,
			mode,
			order,
			locations,
		)
	}
}

function collectObjectChildLocations(
	field: RuntimeObjectField,
	value: unknown,
	fieldPath: readonly string[],
	operationPath: readonly RuntimeFieldValuePathSegment[],
	itemIndex: number,
	kind: FieldInputHookKind,
	mode: Extract<FieldHookMode, 'create' | 'update'>,
	order: RuntimeFieldVisitOrder,
	locations: RuntimeFieldInputLocation[],
): void {
	const visitObject = (
		candidate: unknown,
		remainingListDepth: number,
		candidatePath: readonly RuntimeFieldValuePathSegment[],
	): void => {
		if (remainingListDepth > 0) {
			if (!isUnknownArray(candidate)) {
				return
			}

			for (const [index, item] of candidate.entries()) {
				visitObject(
					item,
					remainingListDepth - 1,
					immutableArray([...candidatePath, index]),
				)
			}
			return
		}

		if (!isPlainRecord(candidate)) {
			return
		}

		collectFieldMapLocations(
			field.options.fields,
			candidate,
			fieldPath,
			candidatePath,
			itemIndex,
			kind,
			mode,
			order,
			locations,
		)
	}

	visitObject(value, getFieldListDepth(field.options), operationPath)
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

		if (!names.includes(operation.field)) {
			names.push(operation.field)
		}
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
		FieldInputHookKind,
		'update-many' | 'update-one' | 'upsert-many' | 'upsert-one'
	>,
	order: RuntimeFieldVisitOrder,
	locations: RuntimeFieldInputLocation[],
): void => {
	for (const [index, operation] of readUpdateOperations(update).entries()) {
		const updateValue = readUpdateOperationValue(operation)

		if (updateValue === undefined) {
			continue
		}

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

interface MissingPathValue {
	readonly found: false
}

interface PresentPathValue {
	readonly found: true
	readonly value: unknown
}

type PathValue = MissingPathValue | PresentPathValue

/** Reads a present value through the segmented paths shared by field lifecycles. */
export const readRuntimeFieldValuePath = (
	root: unknown,
	path: readonly RuntimeFieldValuePathSegment[],
): PathValue => {
	let value = root

	for (const segment of path) {
		if (typeof segment === 'number') {
			if (!isUnknownArray(value) || segment >= value.length) {
				return { found: false }
			}
			value = value[segment]
			continue
		}

		if (!isPlainRecord(value) || !Object.hasOwn(value, segment)) {
			return { found: false }
		}
		value = value[segment]
	}

	return { found: true, value }
}

/** Replaces one field value through immutable record and array copies. */
export const replaceRuntimeFieldValuePath = (
	root: unknown,
	path: readonly RuntimeFieldValuePathSegment[],
	replacement: unknown,
): unknown => {
	const [segment, ...remainingPath] = path

	if (segment === undefined) {
		return replacement
	}

	if (typeof segment === 'number') {
		if (!isUnknownArray(root) || segment >= root.length) {
			throw new TypeError('Runtime field value replacement path is unavailable')
		}

		const values = [...root]
		values[segment] = replaceRuntimeFieldValuePath(
			values[segment],
			remainingPath,
			replacement,
		)
		return immutableArray(values)
	}

	if (!isPlainRecord(root) || !Object.hasOwn(root, segment)) {
		throw new TypeError('Runtime field value replacement path is unavailable')
	}

	return immutableRecord({
		...root,
		[segment]: replaceRuntimeFieldValuePath(
			root[segment],
			remainingPath,
			replacement,
		),
	})
}

/** Applies child-first replacements while preserving the exact operation contract. */
export const transformOperationFieldInputs = async <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	visitor: RuntimeFieldInputVisitor,
): Promise<TOperation> => {
	let transformed: unknown = operation
	const inputs = collectOperationFieldInputs(operation, 'children-first')

	for (const input of inputs) {
		const current = readRuntimeFieldValuePath(transformed, input.valuePath)

		if (!current.found) {
			throw new TypeError(
				'Runtime field input disappeared during transformation',
			)
		}

		const replacement = await visitor(
			immutableRecord({ ...input, value: current.value }),
		)

		// Undefined means observation only; logical field values never use it as data.
		if (replacement !== undefined) {
			transformed = replaceRuntimeFieldValuePath(
				transformed,
				input.valuePath,
				replacement,
			)
		}
	}

	return transformed as TOperation
}

/** Collects one logical record independently from operation-specific wrapper paths. */
export const collectRecordFieldValues = (
	fields: Readonly<Record<string, GenericField>>,
	record: Readonly<Record<string, unknown>>,
	order: RuntimeFieldVisitOrder,
): readonly RuntimeFieldValue[] => {
	const locations: RuntimeFieldInputLocation[] = []

	collectFieldMapLocations(
		fields,
		record,
		immutableArray([]),
		immutableArray([]),
		0,
		'create-one',
		'create',
		order,
		locations,
	)

	return immutableArray(
		locations.map(({ field, fieldPath, value, valuePath }) =>
			immutableRecord({ field, fieldPath, value, valuePath }),
		),
	)
}
