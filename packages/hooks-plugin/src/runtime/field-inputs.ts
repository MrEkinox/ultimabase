import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import type { DatabaseOperationAst, GenericField } from '@ultimabase/core'

import { collectOperationFieldInputs } from './field-input-collection.js'
import {
	collectFieldMapLocations,
	type RuntimeFieldInputLocation,
	type RuntimeFieldInputVisitor,
	type RuntimeFieldValue,
	type RuntimeFieldValuePathSegment,
	type RuntimeFieldVisitOrder,
} from './field-input-traversal.js'

export {
	collectOperationFieldInputs,
	collectUpdateExpressionFieldNames,
} from './field-input-collection.js'
export { getRuntimeOperationFields } from './field-input-traversal.js'
export type {
	RuntimeFieldInputValue,
	RuntimeFieldInputVisitor,
	RuntimeFieldValue,
	RuntimeFieldValuePathSegment,
	RuntimeFieldVisitOrder,
} from './field-input-traversal.js'

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

	if (segment === undefined) return replacement

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
