import {
	snapshotScalarFieldValue,
	type FieldDefinition,
	type SchemaDefinition,
} from '../../schema/index.js'
import { hasListOption } from '../../schema/fields/base/options.js'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	numericUpdateFieldKinds,
	type UpdateExpression,
	type UpdateExpressionInput,
	type UpdateFieldName,
	type UpdateOperationNode,
} from './contracts.js'
import { readPersistedQueryFields } from '../ast/schema.js'
import { assertPlainObject } from '../../exact-object-validation.js'

type RuntimeUpdateField = FieldDefinition<string, unknown, object>

const includesString = (values: readonly string[], value: string): boolean =>
	values.some((candidate) => candidate === value)

const isImmutableField = (field: RuntimeUpdateField): boolean =>
	'immutable' in field.options && field.options.immutable === true

const resolveMutableField = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: unknown,
	path: string,
): readonly [UpdateFieldName<TSchema>, RuntimeUpdateField] => {
	assertNonEmptyString(fieldName, path)

	const fields = readPersistedQueryFields(schema)
	if (!Object.hasOwn(fields, fieldName)) {
		throw new TypeError(`${path} must reference a schema field`)
	}

	const field: RuntimeUpdateField | undefined = fields[fieldName]

	if (field === undefined) {
		throw new TypeError(`${path} must reference a field definition`)
	}

	if (isImmutableField(field)) {
		throw new TypeError(`${path} must reference a mutable schema field`)
	}

	return [fieldName, field]
}

const isNumericUpdateField = (field: RuntimeUpdateField): boolean =>
	!hasListOption(field.options) &&
	includesString(numericUpdateFieldKinds, field.kind)

/** Reads the single `increment` or `decrement` key of one numeric update object. */
const readNumericUpdateKind = (
	value: Readonly<Record<string, unknown>>,
	fieldName: string,
): 'decrement' | 'increment' => {
	const keys = Object.keys(value)
	const [kind] = keys

	if (keys.length !== 1 || (kind !== 'increment' && kind !== 'decrement')) {
		throw new TypeError(
			`update field ${fieldName} must contain exactly one of increment or decrement`,
		)
	}

	return kind
}

/** Normalizes one field entry into a set or numeric update operation. */
const normalizeUpdateOperation = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: string,
	value: unknown,
): UpdateOperationNode<TSchema> => {
	if (value === undefined) {
		throw new TypeError('update value must not be undefined')
	}

	const [mutableFieldName, field] = resolveMutableField(
		schema,
		fieldName,
		'update field',
	)

	// Numeric fields have no object values, so an object is always an operation.
	if (!isNumericUpdateField(field) || !isPlainRecord(value)) {
		// Plugin inference may impose stricter value rules validated by Runtime.
		return immutableRecord({
			kind: 'set',
			field: mutableFieldName,
			value,
		}) as UpdateOperationNode<TSchema>
	}

	const kind = readNumericUpdateKind(value, mutableFieldName)

	return immutableRecord({
		kind,
		field: mutableFieldName,
		value: snapshotScalarFieldValue(field, value[kind], `update ${kind} value`),
	}) as UpdateOperationNode<TSchema>
}

/** Normalizes typed update data into one deterministic atomic AST. */
export const normalizeUpdateExpression = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	input: UpdateExpressionInput<TSchema>,
): UpdateExpression<TSchema> => {
	const untrustedInput: unknown = input

	assertPlainObject(untrustedInput, 'update expression must be an object')

	const operations = Object.entries(untrustedInput).map(([fieldName, value]) =>
		normalizeUpdateOperation(schema, fieldName, value),
	)

	if (operations.length === 0) {
		throw new TypeError('update expression must contain at least one operation')
	}

	return immutableRecord({
		kind: 'update-expression',
		operations: immutableArray(operations),
	})
}
