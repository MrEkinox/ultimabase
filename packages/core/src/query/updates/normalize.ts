import {
	snapshotScalarFieldValue,
	type FieldDefinition,
	type SchemaDefinition,
} from '../../schema/index.js'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	numericUpdateFieldKinds,
	type NumericUpdateFieldName,
	type UpdateExpression,
	type UpdateExpressionInput,
	type UpdateFieldName,
	type UpdateOperationNode,
} from './contracts.js'
import { readPersistedQueryFields } from '../ast/schema.js'
import { isNumericUpdateOperationValue } from './operators.js'

type RuntimeUpdateField = FieldDefinition<string, unknown, object>

const includesString = (values: readonly string[], value: string): boolean =>
	values.some((candidate) => candidate === value)

const isImmutableField = (field: RuntimeUpdateField): boolean =>
	'immutable' in field.options && field.options.immutable === true

const isListField = (field: RuntimeUpdateField): boolean =>
	'list' in field.options &&
	field.options.list !== false &&
	field.options.list !== undefined

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

	// Plugin inference may impose stricter rules that Runtime validates through its handler.
	return [fieldName, field]
}

const resolveNumericField = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: unknown,
	path: string,
): readonly [NumericUpdateFieldName<TSchema>, RuntimeUpdateField] => {
	const [mutableFieldName, field] = resolveMutableField(schema, fieldName, path)

	if (
		isListField(field) ||
		!includesString(numericUpdateFieldKinds, field.kind)
	) {
		throw new TypeError(`${path} must reference a mutable scalar numeric field`)
	}

	return [mutableFieldName as NumericUpdateFieldName<TSchema>, field]
}

const appendUpdateOperation = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: string,
	value: unknown,
	operations: UpdateOperationNode<TSchema>[],
): void => {
	if (value === undefined) {
		throw new TypeError('update value must not be undefined')
	}

	if (isNumericUpdateOperationValue(value)) {
		const [numericFieldName, field] = resolveNumericField(
			schema,
			fieldName,
			`update ${value.kind} field`,
		)
		const normalizedValue = snapshotScalarFieldValue(
			field,
			value.value,
			`update ${value.kind} value`,
		)

		operations.push(
			immutableRecord({
				kind: value.kind,
				field: numericFieldName,
				value: normalizedValue,
			}) as UpdateOperationNode<TSchema>,
		)
		return
	}

	const [mutableFieldName] = resolveMutableField(
		schema,
		fieldName,
		'update field',
	)
	operations.push(
		immutableRecord({
			kind: 'set',
			field: mutableFieldName,
			value,
		}) as UpdateOperationNode<TSchema>,
	)
}

/** Normalizes typed update data into one deterministic atomic AST. */
export const normalizeUpdateExpression = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	input: UpdateExpressionInput<TSchema>,
): UpdateExpression<TSchema> => {
	const untrustedInput: unknown = input

	if (!isPlainRecord(untrustedInput)) {
		throw new TypeError('update expression must be an object')
	}

	const operations: UpdateOperationNode<TSchema>[] = []

	for (const [fieldName, value] of Object.entries(untrustedInput)) {
		appendUpdateOperation(schema, fieldName, value, operations)
	}

	if (operations.length === 0) {
		throw new TypeError('update expression must contain at least one operation')
	}

	return immutableRecord({
		kind: 'update-expression',
		operations: immutableArray(operations),
	})
}
