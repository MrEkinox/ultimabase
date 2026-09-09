import {
	decrement,
	getFieldListDepth,
	getFieldSchemaTarget,
	increment,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { decodeGraphqlFieldValue } from './read-values.js'

type MutationDataMode = 'create' | 'update'
type RelationshipInputMode = 'flat' | 'nested'

const numericKinds = new Set(['bigint', 'decimal', 'float', 'int'])

const targetFor = (field: GenericField): SchemaDefinition | undefined =>
	getFieldSchemaTarget(field)?.()

const decodePointerCommands = (
	field: GenericField,
	value: unknown,
	mode: MutationDataMode,
): unknown => {
	if (!isPlainRecord(value)) return value
	const target = targetFor(field)
	if (target === undefined) return value
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([command, input]) => {
				if (command === 'create') {
					return [
						command,
						decodeGraphqlMutationData(target, input, 'create', 'nested'),
					]
				}
				if (command === 'update' && mode === 'update') {
					return [
						command,
						decodeGraphqlMutationData(target, input, 'update', 'nested'),
					]
				}
				// Core owns command exclusivity, object IDs, and literal-true validation.
				return [command, input]
			}),
		),
	)
}

const decodeRelationUpdateItems = (
	target: SchemaDefinition,
	value: unknown,
): unknown => {
	if (!isUnknownArray(value)) return value
	return immutableArray(
		value.map((item) => {
			if (!isPlainRecord(item)) return item
			return immutableRecord({
				...item,
				...(Object.hasOwn(item, 'data')
					? {
							data: decodeGraphqlMutationData(
								target,
								item.data,
								'update',
								'nested',
							),
						}
					: {}),
			})
		}),
	)
}

const decodeRelationCommands = (
	field: GenericField,
	value: unknown,
): unknown => {
	if (!isPlainRecord(value)) return value
	const target = targetFor(field)
	if (target === undefined) return value
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([command, input]) => {
				if (command === 'create' && isUnknownArray(input)) {
					return [
						command,
						immutableArray(
							input.map((item) =>
								decodeGraphqlMutationData(target, item, 'create', 'nested'),
							),
						),
					]
				}
				if (command === 'update') {
					return [command, decodeRelationUpdateItems(target, input)]
				}
				return [command, input]
			}),
		),
	)
}

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
		const numeric = operand as bigint | number | string
		return operator === 'increment' ? increment(numeric) : decrement(numeric)
	}
	return value
}

/** Decodes GraphQL scalar wrappers while retaining Core-owned nested commands. */
export const decodeGraphqlMutationData = (
	schema: SchemaDefinition,
	value: unknown,
	mode: MutationDataMode,
	relationships: RelationshipInputMode,
): unknown => {
	if (!isPlainRecord(value)) return value
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([name, item]) => {
				const field = schema.fields[name]
				if (field === undefined) return [name, item]
				if (relationships === 'nested' && field.kind === 'pointer') {
					return [name, decodePointerCommands(field, item, mode)]
				}
				if (relationships === 'nested' && field.kind === 'relation') {
					return [name, decodeRelationCommands(field, item)]
				}
				if (mode === 'update') return [name, decodeUpdateValue(field, item)]
				return [name, decodeGraphqlFieldValue(field, item, false)]
			}),
		),
	)
}
