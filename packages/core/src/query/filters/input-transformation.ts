import {
	getFieldSchemaTarget,
	type GenericField,
	type SchemaDefinition,
} from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { readObjectChildFields } from './target.js'

/** Identifies whether an operand belongs to a field or one of its object paths. */
export type QueryFilterOperandSource = 'field' | 'structured-path'

/** Describes one transport-owned operand reached through Core's filter shape. */
export interface QueryFilterOperandInput {
	readonly field: GenericField
	readonly operator: string
	readonly source: QueryFilterOperandSource
	readonly value: unknown
}

/** Converts one wire operand without taking ownership of filter traversal. */
export type QueryFilterOperandTransformer = (
	input: QueryFilterOperandInput,
) => unknown

const relationshipOperators = new Set(['every', 'is', 'isNot', 'none', 'some'])

const transformRecord = (
	record: Readonly<Record<string, unknown>>,
	transform: (name: string, value: unknown) => unknown,
): Readonly<Record<string, unknown>> => {
	// Entries keep every input name, including `__proto__`, as an own key.
	return immutableRecord(
		Object.fromEntries(
			Object.entries(record).map(([name, value]): [string, unknown] => [
				name,
				transform(name, value),
			]),
		),
	)
}

const resolveStructuredPathField = (
	field: GenericField,
	path: readonly unknown[],
): GenericField | undefined => {
	let current: GenericField | undefined = field
	for (const segment of path) {
		if (typeof segment !== 'string' || current?.kind !== 'object')
			return undefined
		current = readObjectChildFields(current)?.get(segment)
	}
	return current
}

const transformStructuredPaths = (
	field: GenericField,
	value: unknown,
	transformOperand: QueryFilterOperandTransformer,
): unknown => {
	if (!isUnknownArray(value)) return value
	return immutableArray(
		value.map((entry) => {
			if (!isPlainRecord(entry) || !isUnknownArray(entry.path)) return entry
			const target = resolveStructuredPathField(field, entry.path)
			if (target === undefined) return entry
			return transformRecord(entry, (operator, operand) =>
				operator === 'path'
					? operand
					: transformOperand({
							field: target,
							operator,
							source: 'structured-path',
							value: operand,
						}),
			)
		}),
	)
}

const transformFieldOperators = (
	field: GenericField,
	value: unknown,
	transformOperand: QueryFilterOperandTransformer,
): unknown => {
	if (!isPlainRecord(value)) return value
	const target = getFieldSchemaTarget(field)?.()
	return transformRecord(value, (operator, operand) => {
		if (target !== undefined && relationshipOperators.has(operator)) {
			return transformQueryFilterInput(target, operand, transformOperand)
		}
		if (target !== undefined && operator === 'count') {
			if (!isPlainRecord(operand)) return operand
			return immutableRecord({
				...operand,
				...(Object.hasOwn(operand, 'where')
					? {
							where: transformQueryFilterInput(
								target,
								operand.where,
								transformOperand,
							),
						}
					: {}),
			})
		}
		return operator === 'at'
			? transformStructuredPaths(field, operand, transformOperand)
			: transformOperand({
					field,
					operator,
					source: 'field',
					value: operand,
				})
	})
}

/**
 * Traverses Core's immutable filter-input shape while delegating wire values.
 *
 * Transport plugins retain scalar decoding and malformed-input policy; Core
 * owns only recursion through logic, relationships, counts, and object paths.
 */
export const transformQueryFilterInput = (
	schema: SchemaDefinition,
	value: unknown,
	transformOperand: QueryFilterOperandTransformer,
): unknown => {
	if (!isPlainRecord(value)) return value
	return transformRecord(value, (name, item) => {
		if (name === 'AND' || name === 'OR') {
			return isUnknownArray(item)
				? immutableArray(
						item.map((entry) =>
							transformQueryFilterInput(schema, entry, transformOperand),
						),
					)
				: item
		}
		if (name === 'NOT') {
			return transformQueryFilterInput(schema, item, transformOperand)
		}
		// Inherited `Object.prototype` members are never persisted fields.
		const field = Object.hasOwn(schema.persistedFields, name)
			? schema.persistedFields[name]
			: undefined
		return field === undefined
			? item
			: transformFieldOperators(field, item, transformOperand)
	})
}
