import {
	decrement,
	getFieldListDepth,
	getFieldSchemaTarget,
	increment,
	transformSchemaMutationDataInput,
	type GenericField,
	type SchemaMutationDataFieldInput,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { decodeRestFieldValue, type InvalidRestValue } from './field-values.js'
import { isUuidV7 } from './read-values.js'

const numericKinds = new Set(['bigint', 'decimal', 'float', 'int'])
const pointerCreateCommands = new Set(['connect', 'create'])
const pointerUpdateCommands = new Set([
	'connect',
	'create',
	'disconnect',
	'update',
])
const relationCreateCommands = new Set(['connect', 'create'])
const relationUpdateCommands = new Set([
	'clear',
	'connect',
	'create',
	'disconnect',
	'set',
	'update',
])

const decodeIdentity = (value: unknown, invalid: InvalidRestValue): string => {
	if (!isUuidV7(value)) throw invalid()
	return value
}

const decodeIdentityArray = (
	value: unknown,
	invalid: InvalidRestValue,
): unknown => {
	if (!isUnknownArray(value)) throw invalid()
	return immutableArray(value.map((item) => decodeIdentity(item, invalid)))
}

const requireTarget = (
	field: GenericField,
	invalid: InvalidRestValue,
): void => {
	if (getFieldSchemaTarget(field)?.() === undefined) throw invalid()
}

const assertKnownCommands = (
	value: unknown,
	commands: ReadonlySet<string>,
	invalid: InvalidRestValue,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) throw invalid()
	const keys = Object.keys(value)
	if (keys.length === 0 || keys.some((key) => !commands.has(key))) {
		throw invalid()
	}
	return value
}

const decodePointerCommands = (
	field: GenericField,
	value: unknown,
	mode: 'create' | 'update',
	invalid: InvalidRestValue,
): unknown => {
	const commands = assertKnownCommands(
		value,
		mode === 'create' ? pointerCreateCommands : pointerUpdateCommands,
		invalid,
	)
	requireTarget(field, invalid)
	const decoded: Record<string, unknown> = {}

	for (const [command, input] of Object.entries(commands)) {
		decoded[command] =
			command === 'connect' ? decodeIdentity(input, invalid) : input
	}
	return immutableRecord(decoded)
}

const decodeRelationUpdateItems = (
	value: unknown,
	invalid: InvalidRestValue,
): unknown => {
	if (!isUnknownArray(value)) throw invalid()
	return immutableArray(
		value.map((item) => {
			if (!isPlainRecord(item)) throw invalid()
			return immutableRecord({
				...item,
				...(Object.hasOwn(item, 'id')
					? { id: decodeIdentity(item.id, invalid) }
					: {}),
			})
		}),
	)
}

const decodeRelationCommands = (
	field: GenericField,
	value: unknown,
	mode: 'create' | 'update',
	invalid: InvalidRestValue,
): unknown => {
	const commands = assertKnownCommands(
		value,
		mode === 'create' ? relationCreateCommands : relationUpdateCommands,
		invalid,
	)
	requireTarget(field, invalid)
	const decoded: Record<string, unknown> = {}

	for (const [command, input] of Object.entries(commands)) {
		if (
			command === 'connect' ||
			command === 'disconnect' ||
			command === 'set'
		) {
			decoded[command] = decodeIdentityArray(input, invalid)
		} else if (command === 'create') {
			if (!isUnknownArray(input)) throw invalid()
			decoded[command] = input
		} else if (command === 'update') {
			decoded[command] = decodeRelationUpdateItems(input, invalid)
		} else {
			// Core Runtime owns literal-true and replacement-exclusivity validation.
			decoded[command] = input
		}
	}
	return immutableRecord(decoded)
}

const decodeNumericUpdate = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
): unknown => {
	if (
		getFieldListDepth(field.options) !== 0 ||
		!numericKinds.has(field.kind) ||
		!isPlainRecord(value) ||
		Object.keys(value).length !== 2 ||
		!Object.hasOwn(value, 'type') ||
		!Object.hasOwn(value, 'value') ||
		(value.type !== 'increment' && value.type !== 'decrement')
	) {
		return undefined
	}

	const operand = decodeRestFieldValue(field, value.value, invalid)
	return value.type === 'increment'
		? increment(operand as bigint | number | string)
		: decrement(operand as bigint | number | string)
}

const decodeMutationField = (
	input: SchemaMutationDataFieldInput,
	invalid: InvalidRestValue,
): unknown => {
	if (input.field === undefined) {
		if (input.kind === 'virtual') throw invalid()
		return input.value
	}
	const { field, mode, relationships, value } = input

	if (relationships === 'nested' && field.kind === 'pointer') {
		return decodePointerCommands(field, value, mode, invalid)
	}
	if (relationships === 'nested' && field.kind === 'relation') {
		return decodeRelationCommands(field, value, mode, invalid)
	}
	if (
		relationships === 'flat' &&
		(field.kind === 'pointer' || field.kind === 'relation')
	) {
		// ADR-0243 keeps bulk and upsert roots flat.
		throw invalid()
	}
	if (mode === 'update') {
		const numeric = decodeNumericUpdate(field, value, invalid)
		if (numeric !== undefined) return numeric
	}
	return decodeRestFieldValue(field, value, invalid, false, 'value')
}

/** Decodes one mutation data object while keeping nested commands declarative. */
export const decodeRestMutationData = (
	schema: SchemaDefinition,
	value: unknown,
	mode: 'create' | 'update',
	relationships: 'flat' | 'nested',
	invalid: InvalidRestValue,
): unknown =>
	transformSchemaMutationDataInput(schema, value, {
		mode,
		relationships,
		transformField: (input) => decodeMutationField(input, invalid),
	})
