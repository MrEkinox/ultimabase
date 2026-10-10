import {
	getFieldListDepth,
	getPluginFieldWireCodec,
	transformQueryFilterInput,
	transformSchemaMutationDataInput,
	type GenericField,
	type SchemaDefinition,
	type SchemaFields,
	type SchemaMutationDataFieldInput,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { isScalarType } from 'graphql'

import { readGraphqlObjectFields } from './compile-context.js'
import { graphqlFieldProtocol } from './protocol.js'
import {
	isGraphqlBuiltInFieldKind,
	readGraphqlScalarInputType,
} from './scalar-types.js'

// GraphQL already coerced typed arguments; only structured JSON paths still
// carry raw wire values that need the canonical scalar coercion.
const decodeScalar = (
	field: GenericField,
	value: unknown,
	fromJson: boolean,
): unknown => {
	if (value === null) return value
	const codec = isGraphqlBuiltInFieldKind(field.kind)
		? undefined
		: getPluginFieldWireCodec(field, graphqlFieldProtocol)
	if (codec !== undefined) return codec.decode(value)
	if (!fromJson) return value
	const scalar = readGraphqlScalarInputType(field)
	return scalar !== undefined && isScalarType(scalar)
		? scalar.coerceInputValue(value)
		: value
}

const decodeObject = (
	fields: SchemaFields,
	value: unknown,
	fromJson: boolean,
): unknown => {
	if (!isPlainRecord(value)) return value
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([name, item]) => {
				const field = fields[name]
				return [
					name,
					field === undefined
						? item
						: decodeGraphqlFieldValue(field, item, fromJson),
				]
			}),
		),
	)
}

const decodeElement = (
	field: GenericField,
	value: unknown,
	fromJson: boolean,
): unknown =>
	field.kind === 'object'
		? decodeObject(readGraphqlObjectFields(field), value, fromJson)
		: decodeScalar(field, value, fromJson)

const decodeElements = (
	field: GenericField,
	value: unknown,
	fromJson: boolean,
): unknown =>
	isUnknownArray(value)
		? immutableArray(
				value.map((entry) => decodeElement(field, entry, fromJson)),
			)
		: value

/** Decodes one GraphQL field value through its canonical scalar or plugin codec. */
const decodeGraphqlFieldValue = (
	field: GenericField,
	value: unknown,
	fromJson: boolean,
): unknown =>
	getFieldListDepth(field.options) === 0
		? decodeElement(field, value, fromJson)
		: decodeElements(field, value, fromJson)

const elementListOperators = new Set(['hasEvery', 'hasSome', 'in', 'notIn'])
const opaqueOperators = new Set([
	'hasAllKeys',
	'hasAnyKeys',
	'hasKey',
	'isEmpty',
	'isNotEmpty',
	'isNotNull',
	'isNull',
	'matches',
])

const decodeOperator = (
	field: GenericField,
	operator: string,
	value: unknown,
	fromJson: boolean,
): unknown => {
	if (operator === 'between' || operator === 'notBetween') {
		if (!isPlainRecord(value)) return value
		return immutableRecord({
			...value,
			...(Object.hasOwn(value, 'lower')
				? { lower: decodeElement(field, value.lower, fromJson) }
				: {}),
			...(Object.hasOwn(value, 'upper')
				? { upper: decodeElement(field, value.upper, fromJson) }
				: {}),
		})
	}
	if (elementListOperators.has(operator)) {
		return decodeElements(field, value, fromJson)
	}
	if (operator === 'eq' || operator === 'ne') {
		return decodeGraphqlFieldValue(field, value, fromJson)
	}
	return opaqueOperators.has(operator)
		? value
		: decodeElement(field, value, fromJson)
}

/** Decodes GraphQL wire values while leaving all validation to Core. */
export const decodeGraphqlWhere = (
	schema: SchemaDefinition,
	value: unknown,
): unknown =>
	transformQueryFilterInput(
		schema,
		value,
		({ field, operator, source, value }) =>
			decodeOperator(field, operator, value, source === 'structured-path'),
	)

const numericKinds = new Set(['bigint', 'decimal', 'float', 'int'])

// Update fields arrive as exactly one `{ set }` or numeric step wrapper.
const decodeUpdateValue = (field: GenericField, value: unknown): unknown => {
	if (!isPlainRecord(value) || Object.keys(value).length !== 1) return value
	const [operator] = Object.keys(value)
	if (operator === undefined) return value
	const operand = decodeGraphqlFieldValue(field, value[operator], false)
	if (operator === 'set') return operand
	if (
		getFieldListDepth(field.options) === 0 &&
		numericKinds.has(field.kind) &&
		(operator === 'increment' || operator === 'decrement')
	) {
		return immutableRecord({ [operator]: operand })
	}
	return value
}

const decodeMutationField = (input: SchemaMutationDataFieldInput): unknown => {
	if (input.field === undefined) return input.value
	const { field, mode, relationships, value } = input
	if (
		relationships === 'nested' &&
		(field.kind === 'pointer' || field.kind === 'relation')
	) {
		// Generated GraphQL inputs own command availability and wrapper shape.
		return value
	}
	return mode === 'update'
		? decodeUpdateValue(field, value)
		: decodeGraphqlFieldValue(field, value, false)
}

/** Decodes GraphQL scalar wrappers while retaining Core-owned nested commands. */
export const decodeGraphqlMutationData = (
	schema: SchemaDefinition,
	value: unknown,
	mode: 'create' | 'update',
	relationships: 'flat' | 'nested',
): unknown =>
	transformSchemaMutationDataInput(schema, value, {
		mode,
		relationships,
		transformField: decodeMutationField,
	})
