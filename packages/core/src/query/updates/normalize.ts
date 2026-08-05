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

const updateGroupKinds = ['set', 'increment', 'decrement'] as const

type NumericUpdateKind = 'decrement' | 'increment'
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

	if (!Object.hasOwn(schema.fields, fieldName)) {
		throw new TypeError(`${path} must reference a schema field`)
	}

	const field: RuntimeUpdateField | undefined = schema.fields[fieldName]

	if (field === undefined) {
		throw new TypeError(`${path} must reference a field definition`)
	}

	if (isImmutableField(field)) {
		throw new TypeError(`${path} must reference a mutable schema field`)
	}

	// Plugin inference may impose stricter rules that Runtime validates through its handler.
	return [fieldName as UpdateFieldName<TSchema>, field]
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

const claimUpdateField = (
	claimedFields: Set<string>,
	fieldName: string,
): void => {
	if (claimedFields.has(fieldName)) {
		throw new TypeError(
			`update field ${fieldName} cannot use more than one operation`,
		)
	}

	claimedFields.add(fieldName)
}

const appendSetOperations = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	group: unknown,
	claimedFields: Set<string>,
	operations: UpdateOperationNode<TSchema>[],
): void => {
	if (!isPlainRecord(group)) {
		throw new TypeError('update set must be an object')
	}

	for (const [fieldName, value] of Object.entries(group)) {
		const [mutableFieldName] = resolveMutableField(
			schema,
			fieldName,
			'update set field',
		)

		if (value === undefined) {
			throw new TypeError('update set value must not be undefined')
		}

		claimUpdateField(claimedFields, mutableFieldName)
		operations.push(
			immutableRecord({
				kind: 'set',
				field: mutableFieldName,
				value,
			}) as UpdateOperationNode<TSchema>,
		)
	}
}

const appendNumericOperations = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	kind: NumericUpdateKind,
	group: unknown,
	claimedFields: Set<string>,
	operations: UpdateOperationNode<TSchema>[],
): void => {
	if (!isPlainRecord(group)) {
		throw new TypeError(`update ${kind} must be an object`)
	}

	for (const [fieldName, value] of Object.entries(group)) {
		const [numericFieldName, field] = resolveNumericField(
			schema,
			fieldName,
			`update ${kind} field`,
		)
		const normalizedValue = snapshotScalarFieldValue(
			field,
			value,
			`update ${kind} value`,
		)

		claimUpdateField(claimedFields, numericFieldName)
		operations.push(
			immutableRecord({
				kind,
				field: numericFieldName,
				value: normalizedValue,
			}) as UpdateOperationNode<TSchema>,
		)
	}
}

const assertKnownUpdateGroups = (
	input: Readonly<Record<string, unknown>>,
): void => {
	for (const key of Object.keys(input)) {
		if (!includesString(updateGroupKinds, key)) {
			throw new TypeError(`update expression contains unknown group: ${key}`)
		}
	}
}

/** Normalizes typed or transport update input into one deterministic atomic AST. */
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

	assertKnownUpdateGroups(untrustedInput)

	const operations: UpdateOperationNode<TSchema>[] = []
	const claimedFields = new Set<string>()

	for (const kind of updateGroupKinds) {
		const group: unknown = untrustedInput[kind]

		if (group === undefined) {
			continue
		}

		switch (kind) {
			case 'set':
				appendSetOperations(schema, group, claimedFields, operations)
				break
			case 'increment':
			case 'decrement':
				appendNumericOperations(schema, kind, group, claimedFields, operations)
				break
		}
	}

	if (operations.length === 0) {
		throw new TypeError('update expression must contain at least one operation')
	}

	return immutableRecord({
		kind: 'update-expression',
		operations: immutableArray(operations),
	})
}
