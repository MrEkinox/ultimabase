import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import type { FieldOutputHookKind } from '../../schema/hooks/field-contracts.js'
import type {
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import {
	isNonAtomicBulkOperation,
	readNonAtomicBulkResult,
} from '../operations/non-atomic-result.js'
import {
	collectRecordFieldValues,
	getRuntimeOperationFields,
	readRuntimeFieldValuePath,
	replaceRuntimeFieldValuePath,
	type RuntimeFieldValue,
	type RuntimeFieldValuePathSegment,
} from './field-inputs.js'

/** Correlates one selected persisted value with its result record. */
export interface RuntimeFieldOutputValue extends RuntimeFieldValue {
	readonly itemIndex: number
	readonly kind: FieldOutputHookKind
	readonly mode: 'object'
}

/** Visits one present selected field while retaining the logical value boundary. */
export type RuntimeFieldOutputVisitor = (
	output: RuntimeFieldOutputValue,
) => MaybePromise<unknown>

interface RuntimeOutputRecord {
	readonly itemIndex: number
	readonly kind: FieldOutputHookKind
	readonly record: Readonly<Record<string, unknown>>
	readonly valuePath: readonly RuntimeFieldValuePathSegment[]
}

const collectionOutputKinds = new Set<FieldOutputHookKind>([
	'create-many',
	'find',
	'upsert-many',
])
const nullableOutputKinds = new Set<FieldOutputHookKind>([
	'delete-one',
	'first',
	'get',
	'update-one',
])
const singularOutputKinds = new Set<FieldOutputHookKind>([
	'create-one',
	'delete-one',
	'first',
	'get',
	'update-one',
	'upsert-one',
])

const isFieldOutputHookKind = (
	kind: DatabaseOperationAst['kind'],
): kind is FieldOutputHookKind =>
	collectionOutputKinds.has(kind as FieldOutputHookKind) ||
	singularOutputKinds.has(kind as FieldOutputHookKind)

const readOutputRecord = (
	value: unknown,
	path: string,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a logical record`)
	}

	return value
}

/** Separates record terminals from scalar and empty results without coercion. */
const collectOutputRecords = (
	operation: DatabaseOperationAst,
	result: unknown,
): readonly RuntimeOutputRecord[] => {
	if (!isFieldOutputHookKind(operation.kind)) {
		return immutableArray([])
	}

	if (result === null) {
		if (!nullableOutputKinds.has(operation.kind)) {
			throw new TypeError(
				'Runtime field outputs cannot be null for this operation',
			)
		}

		return immutableArray([])
	}

	if (collectionOutputKinds.has(operation.kind)) {
		const nonAtomic = isNonAtomicBulkOperation(operation)
		const records = nonAtomic
			? readNonAtomicBulkResult(result, 'Runtime field outputs').results
			: result

		if (!isUnknownArray(records)) {
			throw new TypeError('Runtime field outputs require an array result')
		}

		return immutableArray(
			records.map((record, itemIndex) =>
				immutableRecord({
					itemIndex,
					kind: operation.kind as Extract<
						FieldOutputHookKind,
						'create-many' | 'find' | 'upsert-many'
					>,
					record: readOutputRecord(
						record,
						`Runtime field output record[${String(itemIndex)}]`,
					),
					valuePath: immutableArray(
						nonAtomic ? ['results', itemIndex] : [itemIndex],
					),
				}),
			),
		)
	}

	return immutableArray([
		immutableRecord({
			itemIndex: 0,
			kind: operation.kind,
			record: readOutputRecord(result, 'Runtime field output record'),
			valuePath: immutableArray([]),
		}),
	])
}

/** Restricts traversal to top-level fields selected by a query-backed terminal. */
const getReadableOutputFields = (
	operation: DatabaseOperationAst,
): Readonly<Record<string, RuntimeFieldOutputValue['field']>> => {
	const fields = getRuntimeOperationFields(operation)
	const untrustedOperation: unknown = operation

	if (
		!isPlainRecord(untrustedOperation) ||
		!isPlainRecord(untrustedOperation.query) ||
		!isPlainRecord(untrustedOperation.query.selection) ||
		!isUnknownArray(untrustedOperation.query.selection.fields) ||
		untrustedOperation.query.selection.fields.length === 0
	) {
		return fields
	}

	const selectedFields: Record<string, RuntimeFieldOutputValue['field']> = {}

	for (const selected of untrustedOperation.query.selection.fields) {
		const field =
			isPlainRecord(selected) && typeof selected.field === 'string'
				? fields[selected.field]
				: undefined

		if (
			isPlainRecord(selected) &&
			typeof selected.field === 'string' &&
			Object.hasOwn(fields, selected.field) &&
			field !== undefined
		) {
			selectedFields[selected.field] = field
		}
	}

	return immutableRecord(selectedFields)
}

/** Collects selected present values in stable record and child-first order. */
export const collectOperationFieldOutputs = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	result: DatabaseOperationResult<TOperation>,
): readonly RuntimeFieldOutputValue[] => {
	const fields = getReadableOutputFields(operation)
	const outputs: RuntimeFieldOutputValue[] = []

	for (const record of collectOutputRecords(operation, result)) {
		for (const value of collectRecordFieldValues(
			fields,
			record.record,
			'children-first',
		)) {
			outputs.push(
				immutableRecord({
					...value,
					itemIndex: record.itemIndex,
					kind: record.kind,
					mode: 'object',
					valuePath: immutableArray([...record.valuePath, ...value.valuePath]),
				}),
			)
		}
	}

	return immutableArray(outputs)
}

/** Applies selected child-first replacements without changing result semantics. */
export const transformOperationFieldOutputs = async <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	result: DatabaseOperationResult<TOperation>,
	visitor: RuntimeFieldOutputVisitor,
): Promise<DatabaseOperationResult<TOperation>> => {
	let transformed: unknown = result

	for (const output of collectOperationFieldOutputs(operation, result)) {
		const current = readRuntimeFieldValuePath(transformed, output.valuePath)

		if (!current.found) {
			throw new TypeError(
				'Runtime field output disappeared during transformation',
			)
		}

		const replacement = await visitor(
			immutableRecord({ ...output, value: current.value }),
		)

		// Undefined observes without replacing a present logical output value.
		if (replacement !== undefined) {
			transformed = replaceRuntimeFieldValuePath(
				transformed,
				output.valuePath,
				replacement,
			)
		}
	}

	return transformed as DatabaseOperationResult<TOperation>
}
