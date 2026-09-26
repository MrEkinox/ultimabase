import {
	decrement,
	getFieldListDepth,
	increment,
	transformSchemaMutationDataInput,
	type GenericField,
	type SchemaDefinition,
	type SchemaMutationDataFieldInput,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'

import { decodeGraphqlFieldValue } from './read-values.js'

const numericKinds = new Set(['bigint', 'decimal', 'float', 'int'])

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
