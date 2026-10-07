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
import { readUpdateExpressionOperations } from '../../query/updates/structure.js'
import { Schema, type GenericField } from '../../schema/index.js'
import { getFieldListDepth } from '../../schema/fields/base/options.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'
import type { PluginSchemaMutationOperationAst } from '../schema-mutations/contracts.js'

export type RuntimeFieldValuePathSegment = number | string
export type RuntimeFieldVisitOrder = 'children-first' | 'parent-first'

/** Retains low-level adapter AST kinds without exposing collection kinds to item behavior. */
type RuntimeFieldInputKind =
	| 'create-many'
	| 'create-one'
	| 'update-many'
	| 'update-one'
	| 'upsert-many'
	| 'upsert-one'
	| 'plugin-schema-mutation'

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
	readonly mode: 'create' | 'update'
}

/** Observes or replaces one exact normalized persisted mutation input value. */
export type RuntimeFieldInputVisitor = (
	input: RuntimeFieldInputValue,
) => MaybePromise<unknown>

interface RuntimeObjectField extends GenericField {
	readonly kind: 'object'
	readonly options: Readonly<{
		readonly fields: Readonly<Record<string, GenericField>>
	}>
}

/** Identifies the mutation candidate whose present field values are collected. */
interface RuntimeFieldInputContext {
	readonly itemIndex: number
	readonly kind: RuntimeFieldInputKind
	readonly locations: RuntimeFieldInputValue[]
	readonly mode: 'create' | 'update'
	readonly order: RuntimeFieldVisitOrder
}

type Path = readonly RuntimeFieldValuePathSegment[]

const isRuntimeObjectField = (
	field: GenericField,
): field is RuntimeObjectField =>
	field.kind === 'object' &&
	'fields' in field.options &&
	isPlainRecord(field.options.fields)

/** Adds one field visit before or after its nested object children. */
const collectFieldLocations = (
	field: GenericField,
	value: unknown,
	fieldPath: readonly string[],
	valuePath: Path,
	context: RuntimeFieldInputContext,
): void => {
	const { itemIndex, kind, locations, mode, order } = context
	const append = () => {
		locations.push(
			immutableRecord({
				field,
				fieldPath: immutableArray(fieldPath),
				itemIndex,
				kind,
				mode,
				value,
				valuePath: immutableArray(valuePath),
			}),
		)
	}

	if (order === 'parent-first') append()
	if (isRuntimeObjectField(field)) {
		collectObjectLocations(
			field,
			value,
			getFieldListDepth(field.options),
			fieldPath,
			valuePath,
			context,
		)
	}
	if (order === 'children-first') append()
}

const collectFieldMapLocations = (
	fields: Readonly<Record<string, GenericField>>,
	value: Readonly<Record<string, unknown>>,
	fieldPath: readonly string[],
	valuePath: Path,
	context: RuntimeFieldInputContext,
): void => {
	for (const [name, field] of Object.entries(fields)) {
		if (!Object.hasOwn(value, name)) continue

		collectFieldLocations(
			field,
			value[name],
			immutableArray([...fieldPath, name]),
			immutableArray([...valuePath, name]),
			context,
		)
	}
}

/** Descends through declared list depth before visiting each nested object. */
function collectObjectLocations(
	field: RuntimeObjectField,
	candidate: unknown,
	remainingListDepth: number,
	fieldPath: readonly string[],
	valuePath: Path,
	context: RuntimeFieldInputContext,
): void {
	if (remainingListDepth === 0) {
		if (isPlainRecord(candidate)) {
			collectFieldMapLocations(
				field.options.fields,
				candidate,
				fieldPath,
				valuePath,
				context,
			)
		}
		return
	}
	if (!isUnknownArray(candidate)) return

	for (const [index, item] of candidate.entries()) {
		collectObjectLocations(
			field,
			item,
			remainingListDepth - 1,
			fieldPath,
			immutableArray([...valuePath, index]),
			context,
		)
	}
}

const readUpdateOperations = (
	update: UpdateExpressionNode,
): readonly Readonly<Record<string, unknown>>[] =>
	readUpdateExpressionOperations(
		update,
		'Runtime field inputs require an update expression',
	)

/** Lists every explicitly affected top-level field. */
export const collectUpdateExpressionFieldNames = (
	update: UpdateExpressionNode,
): readonly string[] => {
	const names = new Set<string>()

	for (const operation of readUpdateOperations(update)) {
		if (typeof operation.field !== 'string') {
			throw new TypeError(
				'Runtime field inputs contain an update without a field name',
			)
		}
		names.add(operation.field)
	}

	return immutableArray([...names])
}

const collectUpdateLocations = (
	update: UpdateExpressionNode,
	fields: Readonly<Record<string, GenericField>>,
	valuePath: Path,
	context: RuntimeFieldInputContext,
): void => {
	for (const [index, operation] of readUpdateOperations(update).entries()) {
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

		const field = fields[operation.field]
		if (field === undefined) {
			throw new TypeError(
				`Runtime field inputs reference unknown field ${JSON.stringify(operation.field)}`,
			)
		}

		collectFieldLocations(
			field,
			operation.value,
			immutableArray([operation.field]),
			immutableArray([...valuePath, 'operations', index, 'value']),
			context,
		)
	}
}

/** Names one create record or update expression inside an operation wrapper. */
type RuntimeFieldInputRoot = Readonly<
	{ itemIndex: number; kind: RuntimeFieldInputKind; path: Path } & (
		| { mode: 'create'; value: Readonly<Record<string, unknown>> }
		| { mode: 'update'; value: UpdateExpressionNode }
	)
>

/** Normalizes operation wrappers without changing field traversal semantics. */
const collectOperationFieldInputRoots = (
	operation: DatabaseOperationAst | PluginSchemaMutationOperationAst,
): readonly RuntimeFieldInputRoot[] => {
	if (operation.kind === 'plugin-schema-mutation') {
		return operation.effect?.kind === 'update'
			? [
					{
						itemIndex: 0,
						kind: operation.kind,
						mode: 'update',
						path: ['effect', 'update'],
						value: operation.effect.update,
					},
				]
			: []
	}

	const executable = operation as unknown as ExecutableOperationAst

	switch (executable.kind) {
		case 'create-one':
			return [
				{
					itemIndex: 0,
					kind: executable.kind,
					mode: 'create',
					path: ['input'],
					value: executable.input,
				},
			]
		case 'create-many':
			return executable.inputs.map((value, itemIndex) => ({
				itemIndex,
				kind: executable.kind,
				mode: 'create',
				path: ['inputs', itemIndex],
				value,
			}))
		case 'update-many':
		case 'update-one':
			return [
				{
					itemIndex: 0,
					kind: executable.kind,
					mode: 'update',
					path: ['update'],
					value: executable.update,
				},
			]
		case 'upsert-one':
			return [
				{
					itemIndex: 0,
					kind: executable.kind,
					mode: 'create',
					path: ['create'],
					value: executable.create,
				},
				{
					itemIndex: 0,
					kind: executable.kind,
					mode: 'update',
					path: ['update'],
					value: executable.update,
				},
			]
		case 'upsert-many':
			return executable.items.flatMap(
				(item, itemIndex): readonly RuntimeFieldInputRoot[] => [
					{
						itemIndex,
						kind: executable.kind,
						mode: 'create',
						path: ['items', itemIndex, 'create'],
						value: item.create,
					},
					{
						itemIndex,
						kind: executable.kind,
						mode: 'update',
						path: ['items', itemIndex, 'update'],
						value: item.update,
					},
				],
			)
		default:
			return []
	}
}

/** Collects every present candidate value in deterministic item and field order. */
export const collectOperationFieldInputs = (
	operation: DatabaseOperationAst | PluginSchemaMutationOperationAst,
	order: RuntimeFieldVisitOrder,
): readonly RuntimeFieldInputValue[] => {
	const schema = getOperationSchema(operation)

	if (!Schema.is(schema)) {
		throw new TypeError('Runtime field traversal requires a declared schema')
	}

	const fields = schema.persistedFields
	const locations: RuntimeFieldInputValue[] = []

	for (const root of collectOperationFieldInputRoots(operation)) {
		const context = {
			itemIndex: root.itemIndex,
			kind: root.kind,
			locations,
			mode: root.mode,
			order,
		}
		if (root.mode === 'update') {
			collectUpdateLocations(root.value, fields, root.path, context)
		} else {
			collectFieldMapLocations(
				fields,
				root.value,
				immutableArray([]),
				root.path,
				context,
			)
		}
	}

	return immutableArray(locations)
}

type PathValue =
	Readonly<{ found: false }> | Readonly<{ found: true; value: unknown }>

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

/**
 * Visits normalized persisted mutation inputs children-first and immutably
 * replaces every value for which the visitor returns a defined result.
 * Returning `undefined` observes without replacement.
 *
 * @example `await transformOperationFieldInputs(operation, ({ value }) => value)`
 */
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
	const locations: RuntimeFieldInputValue[] = []

	collectFieldMapLocations(
		fields,
		record,
		immutableArray([]),
		immutableArray([]),
		{
			itemIndex: 0,
			kind: 'create-one',
			locations,
			mode: 'create',
			order,
		},
	)

	return immutableArray(
		locations.map(({ field, fieldPath, value, valuePath }) =>
			immutableRecord({ field, fieldPath, value, valuePath }),
		),
	)
}
