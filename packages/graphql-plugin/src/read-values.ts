import {
	getFieldListDepth,
	getPluginFieldWireCodec,
	transformQueryFilterInput,
	type GenericField,
	type PluginFieldWireCodec,
	type SchemaDefinition,
	type SchemaFields,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { isScalarType } from 'graphql'

import {
	isGraphqlBuiltInFieldKind,
	readGraphqlObjectFields,
} from './field-metadata.js'
import { graphqlFieldProtocol } from './protocol.js'
import { readGraphqlScalarInputType } from './scalar-types.js'

const pluginCodec = (field: GenericField): PluginFieldWireCodec | undefined =>
	isGraphqlBuiltInFieldKind(field.kind)
		? undefined
		: getPluginFieldWireCodec(field, graphqlFieldProtocol)

const decodeScalar = (
	field: GenericField,
	value: unknown,
	fromJson: boolean,
): unknown => {
	if (value === null) return value
	const codec = pluginCodec(field)
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

/** Decodes one GraphQL field value through its canonical scalar or plugin codec. */
export const decodeGraphqlFieldValue = (
	field: GenericField,
	value: unknown,
	fromJson: boolean,
): unknown => {
	if (getFieldListDepth(field.options) === 0) {
		return decodeElement(field, value, fromJson)
	}
	if (!isUnknownArray(value)) return value
	return immutableArray(
		value.map((entry) => decodeElement(field, entry, fromJson)),
	)
}

const decodeRange = (
	field: GenericField,
	value: unknown,
	fromJson: boolean,
): unknown => {
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

const decodeOperator = (
	field: GenericField,
	operator: string,
	value: unknown,
	fromJson: boolean,
): unknown => {
	if (operator === 'between' || operator === 'notBetween') {
		return decodeRange(field, value, fromJson)
	}
	if (operator === 'in' || operator === 'notIn') {
		if (!isUnknownArray(value)) return value
		return immutableArray(
			value.map((entry) => decodeElement(field, entry, fromJson)),
		)
	}
	if (operator === 'has') return decodeElement(field, value, fromJson)
	if (operator === 'hasEvery' || operator === 'hasSome') {
		if (!isUnknownArray(value)) return value
		return immutableArray(
			value.map((entry) => decodeElement(field, entry, fromJson)),
		)
	}
	if (operator === 'eq' || operator === 'ne') {
		return decodeGraphqlFieldValue(field, value, fromJson)
	}
	if (operator === 'contains' || operator === 'containedBy') {
		return field.kind === 'object'
			? decodeObject(readGraphqlObjectFields(field), value, fromJson)
			: decodeElement(field, value, fromJson)
	}
	if (
		operator === 'isNull' ||
		operator === 'isNotNull' ||
		operator === 'isEmpty' ||
		operator === 'isNotEmpty' ||
		operator === 'hasKey' ||
		operator === 'hasAllKeys' ||
		operator === 'hasAnyKeys' ||
		operator === 'jsonPathExists' ||
		operator === 'jsonPathMatches' ||
		operator === 'matches'
	) {
		return value
	}
	return decodeElement(field, value, fromJson)
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
