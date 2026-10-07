import {
	getFieldSchemaTarget,
	transformQueryFilterInput,
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
import { decodeRestFieldValue, decodeRestListElement } from './field-values.js'

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

const relationshipOperators = new Set(['every', 'is', 'isNot', 'none', 'some'])

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

/** Decodes field values while leaving operator validity to Core normalization. */
export const decodeRestWhere = (
	schema: SchemaDefinition,
	value: unknown,
): unknown =>
	transformQueryFilterInput(schema, value, ({ field, operator, value }) =>
		relationshipOperators.has(operator) &&
		getFieldSchemaTarget(field) === undefined
			? value
			: decodeOperator(field, operator, value),
	)
