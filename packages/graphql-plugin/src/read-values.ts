import {
	getFieldListDepth,
	getFieldSchemaTarget,
	getPluginFieldWireCodec,
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

const resolvePathField = (
	field: GenericField,
	path: readonly unknown[],
): GenericField | undefined => {
	let current: GenericField | undefined = field
	for (const segment of path) {
		if (typeof segment !== 'string' || current?.kind !== 'object') {
			return undefined
		}
		current = readGraphqlObjectFields(current)[segment]
	}
	return current
}

const decodeAt = (field: GenericField, value: unknown): unknown => {
	if (!isUnknownArray(value)) return value
	return immutableArray(
		value.map((entry) => {
			if (!isPlainRecord(entry) || !isUnknownArray(entry.path)) return entry
			const target = resolvePathField(field, entry.path)
			if (target === undefined) return entry
			return immutableRecord(
				Object.fromEntries(
					Object.entries(entry).map(([operator, operand]) => [
						operator,
						operator === 'path'
							? operand
							: decodeOperator(target, operator, operand, true),
					]),
				),
			)
		}),
	)
}

const decodeRelationship = (
	field: GenericField,
	operator: string,
	value: unknown,
): unknown => {
	const target = getFieldSchemaTarget(field)?.()
	if (target === undefined) return value
	if (
		operator === 'some' ||
		operator === 'none' ||
		operator === 'every' ||
		operator === 'is' ||
		operator === 'isNot'
	) {
		return decodeGraphqlWhere(target, value)
	}
	if (operator === 'count' && isPlainRecord(value)) {
		return immutableRecord({
			...value,
			...(Object.hasOwn(value, 'where')
				? { where: decodeGraphqlWhere(target, value.where) }
				: {}),
		})
	}
	return value
}

/** Decodes GraphQL wire values while leaving all validation to Core. */
export const decodeGraphqlWhere = (
	schema: SchemaDefinition,
	value: unknown,
): unknown => {
	if (!isPlainRecord(value)) return value
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([name, item]) => {
				if (name === 'AND' || name === 'OR') {
					return [
						name,
						isUnknownArray(item)
							? immutableArray(
									item.map((entry) => decodeGraphqlWhere(schema, entry)),
								)
							: item,
					]
				}
				if (name === 'NOT') return [name, decodeGraphqlWhere(schema, item)]
				const field = schema.persistedFields[name]
				if (field === undefined || !isPlainRecord(item)) return [name, item]
				return [
					name,
					immutableRecord(
						Object.fromEntries(
							Object.entries(item).map(([operator, operand]) => [
								operator,
								field.kind === 'pointer' || field.kind === 'relation'
									? decodeRelationship(field, operator, operand)
									: operator === 'at'
										? decodeAt(field, operand)
										: decodeOperator(field, operator, operand, false),
							]),
						),
					),
				]
			}),
		),
	)
}
