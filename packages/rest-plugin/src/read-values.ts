import {
	getFieldSchemaTarget,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { invalidRestRead } from './errors.js'
import {
	decodeRestFieldValue,
	decodeRestListElement,
	resolveRestObjectPathField,
} from './field-values.js'

export { isUuidV7 } from './field-values.js'

const decodeRange = (
	field: GenericField,
	value: unknown,
): Readonly<Record<string, unknown>> => {
	if (
		!isPlainRecord(value) ||
		Object.keys(value).length !== 2 ||
		!Object.hasOwn(value, 'lower') ||
		!Object.hasOwn(value, 'upper')
	) {
		throw invalidRestRead()
	}
	return immutableRecord({
		lower: decodeRestFieldValue(field, value.lower, invalidRestRead),
		upper: decodeRestFieldValue(field, value.upper, invalidRestRead),
	})
}

const untouchedOperators = new Set([
	'count',
	'hasAllKeys',
	'hasAnyKeys',
	'hasKey',
	'isEmpty',
	'isNotEmpty',
	'isNotNull',
	'isNull',
	'jsonPathExists',
	'jsonPathMatches',
	'matches',
])

const decodeOperator = (
	field: GenericField,
	operator: string,
	value: unknown,
): unknown => {
	if (operator === 'between' || operator === 'notBetween') {
		return decodeRange(field, value)
	}
	if (operator === 'in' || operator === 'notIn') {
		if (!isUnknownArray(value)) throw invalidRestRead()
		return immutableArray(
			value.map((item) => decodeRestFieldValue(field, item, invalidRestRead)),
		)
	}
	if (operator === 'has')
		return decodeRestListElement(field, value, invalidRestRead)
	if (operator === 'hasSome' || operator === 'hasEvery') {
		if (!isUnknownArray(value)) throw invalidRestRead()
		return immutableArray(
			value.map((item) => decodeRestListElement(field, item, invalidRestRead)),
		)
	}
	if (operator === 'contains' || operator === 'containedBy') {
		return field.kind === 'object'
			? decodeRestFieldValue(field, value, invalidRestRead, true)
			: field.kind === 'json' || field.kind.includes('.')
				? value
				: decodeRestFieldValue(field, value, invalidRestRead)
	}
	return untouchedOperators.has(operator)
		? value
		: decodeRestFieldValue(field, value, invalidRestRead)
}

const decodeAt = (field: GenericField, value: unknown): unknown => {
	if (!isUnknownArray(value)) return value
	return immutableArray(
		value.map((entry) => {
			if (!isPlainRecord(entry) || !isUnknownArray(entry.path)) return entry
			const target = resolveRestObjectPathField(
				field,
				entry.path,
				invalidRestRead,
			)
			if (target === undefined) return entry
			return immutableRecord(
				Object.fromEntries(
					Object.entries(entry).map(([key, item]) => [
						key,
						key === 'path' ? item : decodeOperator(target, key, item),
					]),
				),
			)
		}),
	)
}

const decodeRelationshipWhere = (
	field: GenericField,
	value: unknown,
): unknown => {
	const target = getFieldSchemaTarget(field)?.()
	return target === undefined ? value : decodeRestWhere(target, value)
}

const decodeFieldOperators = (field: GenericField, value: unknown): unknown => {
	if (!isPlainRecord(value)) return value
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([operator, operand]) => {
				if (operator === 'at') return [operator, decodeAt(field, operand)]
				if (
					operator === 'some' ||
					operator === 'none' ||
					operator === 'every' ||
					operator === 'is' ||
					operator === 'isNot'
				) {
					return [operator, decodeRelationshipWhere(field, operand)]
				}
				if (operator === 'count' && isPlainRecord(operand)) {
					const target = getFieldSchemaTarget(field)?.()
					return [
						operator,
						immutableRecord({
							...operand,
							...(Object.hasOwn(operand, 'where') && target !== undefined
								? { where: decodeRestWhere(target, operand.where) }
								: {}),
						}),
					]
				}
				return [operator, decodeOperator(field, operator, operand)]
			}),
		),
	)
}

/** Decodes field values while leaving operator validity to Core normalization. */
export const decodeRestWhere = (
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
									item.map((entry) => decodeRestWhere(schema, entry)),
								)
							: item,
					]
				}
				if (name === 'NOT') return [name, decodeRestWhere(schema, item)]
				const field = schema.persistedFields[name]
				return [
					name,
					field === undefined ? item : decodeFieldOperators(field, item),
				]
			}),
		),
	)
}
