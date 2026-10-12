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
import { isWhereShorthandField } from './where-shorthand.js'

/**
 * Identifies whether an operand belongs to a field, one of its object paths,
 * or the equality shorthand of a field (`where: { completed: false }`,
 * ADR-0307), which carries the operator `eq`.
 */
export type QueryFilterOperandSource = 'field' | 'shorthand' | 'structured-path'

/** Describes one transport-owned operand reached through Core's filter shape. */
export interface QueryFilterOperandInput {
	readonly field: GenericField
	readonly operator: string
	/**
	 * Location of the operand in the filter, for transport error details:
	 * `['title', 'contains']`, `['AND', 0, 'author', 'is', 'name', 'eq']`.
	 */
	readonly path: readonly (number | string)[]
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
	path: readonly (number | string)[],
): unknown => {
	if (!isUnknownArray(value)) return value
	return immutableArray(
		value.map((entry, index) => {
			if (!isPlainRecord(entry) || !isUnknownArray(entry.path)) return entry
			const target = resolveStructuredPathField(field, entry.path)
			if (target === undefined) return entry
			return transformRecord(entry, (operator, operand) =>
				operator === 'path'
					? operand
					: transformOperand({
							field: target,
							operator,
							path: immutableArray([...path, index, operator]),
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
	path: readonly (number | string)[],
): unknown => {
	if (!isPlainRecord(value)) {
		// `null` (isNull) and shapes Core rejects need no transport decoding.
		return value === null || !isWhereShorthandField(field)
			? value
			: transformOperand({
					field,
					operator: 'eq',
					path,
					source: 'shorthand',
					value,
				})
	}
	const target = getFieldSchemaTarget(field)?.()
	return transformRecord(value, (operator, operand) => {
		if (target !== undefined && relationshipOperators.has(operator)) {
			return transformFilter(target, operand, transformOperand, [
				...path,
				operator,
			])
		}
		if (target !== undefined && operator === 'count') {
			if (!isPlainRecord(operand)) return operand
			return immutableRecord({
				...operand,
				...(Object.hasOwn(operand, 'where')
					? {
							where: transformFilter(target, operand.where, transformOperand, [
								...path,
								operator,
								'where',
							]),
						}
					: {}),
			})
		}
		return operator === 'at'
			? transformStructuredPaths(field, operand, transformOperand, [
					...path,
					operator,
				])
			: transformOperand({
					field,
					operator,
					path: immutableArray([...path, operator]),
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
): unknown => transformFilter(schema, value, transformOperand, [])

const transformFilter = (
	schema: SchemaDefinition,
	value: unknown,
	transformOperand: QueryFilterOperandTransformer,
	path: readonly (number | string)[],
): unknown => {
	if (!isPlainRecord(value)) return value
	return transformRecord(value, (name, item) => {
		if (name === 'AND' || name === 'OR') {
			return isUnknownArray(item)
				? immutableArray(
						item.map((entry, index) =>
							transformFilter(schema, entry, transformOperand, [
								...path,
								name,
								index,
							]),
						),
					)
				: item
		}
		if (name === 'NOT') {
			return transformFilter(schema, item, transformOperand, [...path, name])
		}
		// Inherited `Object.prototype` members are never persisted fields.
		const field = Object.hasOwn(schema.persistedFields, name)
			? schema.persistedFields[name]
			: undefined
		return field === undefined
			? item
			: transformFieldOperators(
					field,
					item,
					transformOperand,
					immutableArray([...path, name]),
				)
	})
}
