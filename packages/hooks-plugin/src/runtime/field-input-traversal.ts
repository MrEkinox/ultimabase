import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'
import {
	getFieldListDepth,
	getOperationSchema,
	Schema,
	type DatabaseOperationAst,
	type GenericField,
} from '@ultimabase/core'

import type { FieldHookMode } from '../authoring/field-contracts.js'

export type RuntimeFieldValuePathSegment = number | string
export type RuntimeFieldVisitOrder = 'children-first' | 'parent-first'

/** Retains low-level adapter AST kinds without exposing collection kinds to item hooks. */
export type RuntimeFieldInputKind =
	| 'create-many'
	| 'create-one'
	| 'update-many'
	| 'update-one'
	| 'upsert-many'
	| 'upsert-one'

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
	readonly kind: RuntimeFieldInputKind
	readonly mode: Extract<FieldHookMode, 'create' | 'update'>
}

export type RuntimeFieldInputVisitor = (
	input: RuntimeFieldInputValue,
) => MaybePromise<unknown>

export type RuntimeFieldInputLocation = RuntimeFieldInputValue

interface RuntimeObjectField extends GenericField {
	readonly kind: 'object'
	readonly options: Readonly<{
		readonly fields: Readonly<Record<string, GenericField>>
	}>
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
	kind: RuntimeFieldInputKind,
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

export const collectFieldLocations = (
	field: GenericField,
	value: unknown,
	fieldPath: readonly string[],
	operationPath: readonly RuntimeFieldValuePathSegment[],
	itemIndex: number,
	kind: RuntimeFieldInputKind,
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

export const collectFieldMapLocations = (
	fields: Readonly<Record<string, GenericField>>,
	value: Readonly<Record<string, unknown>>,
	parentFieldPath: readonly string[],
	parentOperationPath: readonly RuntimeFieldValuePathSegment[],
	itemIndex: number,
	kind: RuntimeFieldInputKind,
	mode: Extract<FieldHookMode, 'create' | 'update'>,
	order: RuntimeFieldVisitOrder,
	locations: RuntimeFieldInputLocation[],
): void => {
	for (const [name, field] of Object.entries(fields)) {
		if (!Object.hasOwn(value, name)) continue

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
	kind: RuntimeFieldInputKind,
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
			if (!isUnknownArray(candidate)) return

			for (const [index, item] of candidate.entries()) {
				visitObject(
					item,
					remainingListDepth - 1,
					immutableArray([...candidatePath, index]),
				)
			}
			return
		}

		if (!isPlainRecord(candidate)) return

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
