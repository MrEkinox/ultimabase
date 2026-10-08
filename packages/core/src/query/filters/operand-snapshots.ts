import {
	getPluginFieldStructuralContains,
	snapshotScalarFieldValue,
} from '../../schema/index.js'
import { snapshotPluginFieldStructuralContainsOperand } from '../../schema/fields/base/definition.js'
import {
	getFieldListDepth,
	hasListOption,
	isFieldNullable,
} from '../../schema/fields/base/options.js'
import { snapshotJsonValue } from '../../schema/fields/base/portable-json.js'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { readObjectChildFields, type RuntimeQueryField } from './target.js'
import { assertPlainObject } from '../../exact-object-validation.js'

/*
 * Operand snapshots shared by the filter factories: each operand is copied and
 * validated against the declared field before it enters an immutable AST node.
 */

export const snapshotNonNullValue = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
): unknown => {
	if (value === null) {
		throw new TypeError(`${path} must not be null`)
	}

	return snapshotScalarFieldValue(field, value, path)
}

export const snapshotList = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
): readonly unknown[] => {
	if (!isUnknownArray(value)) {
		throw new TypeError(`${path} must be a list`)
	}

	return immutableArray(
		value.map((item, index) =>
			snapshotNonNullValue(field, item, `${path}[${String(index)}]`),
		),
	)
}

/** Snapshots one complete field value, including nullable and list shapes. */
export const snapshotFieldValue = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
): unknown => {
	if (value === null && isFieldNullable(field)) return null

	return hasListOption(field.options)
		? snapshotList(field, value, path)
		: snapshotScalarFieldValue(field, value, path)
}

const snapshotPartialField = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
	listDepth = getFieldListDepth(field.options),
	allowNull = true,
): unknown => {
	if (allowNull && value === null && isFieldNullable(field)) return null

	if (listDepth > 0) {
		if (!isUnknownArray(value)) {
			throw new TypeError(`${path} must be a list`)
		}

		return immutableArray(
			value.map((item, index) =>
				snapshotPartialField(
					field,
					item,
					`${path}[${String(index)}]`,
					listDepth - 1,
					false,
				),
			),
		)
	}

	return field.kind === 'object'
		? snapshotPartialObject(field, value, path)
		: snapshotScalarFieldValue(field, value, path)
}

/** Containment operands may name any subset of declared object fields. */
const snapshotPartialObject = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
): Readonly<Record<string, unknown>> => {
	assertPlainObject(value, `${path} must be a plain object`)

	const fields = readObjectChildFields(field)

	if (fields === undefined) {
		throw new TypeError(`${path} requires object field metadata`)
	}

	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([name, item]) => {
				const child = fields.get(name)

				if (child === undefined) {
					throw new TypeError(`${path}.${name} is not a declared field`)
				}

				return [name, snapshotPartialField(child, item, `${path}.${name}`)]
			}),
		),
	)
}

export const snapshotStructuralValue = (
	field: RuntimeQueryField | undefined,
	value: unknown,
	path: string,
): unknown => {
	if (field === undefined) return snapshotJsonValue(value, path)

	if (getPluginFieldStructuralContains(field) !== undefined) {
		return snapshotPluginFieldStructuralContainsOperand(field, value, path)
	}

	return field.kind === 'object'
		? snapshotPartialObject(field, value, path)
		: snapshotScalarFieldValue(field, value, path)
}
