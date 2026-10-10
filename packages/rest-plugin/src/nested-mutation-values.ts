import {
	getFieldListDepth,
	getFieldSchemaTarget,
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

import {
	decodeRestFieldValue,
	isUuidV7,
	type InvalidRestValue,
} from './field-values.js'

const numericKinds = new Set(['bigint', 'decimal', 'float', 'int'])

// ADR-0243 command allowlists; Core validates their payloads and exclusivity.
const nestedCommands = {
	pointer: {
		create: new Set(['connect', 'create']),
		update: new Set(['connect', 'create', 'disconnect', 'update']),
	},
	relation: {
		create: new Set(['connect', 'create']),
		update: new Set([
			'clear',
			'connect',
			'create',
			'disconnect',
			'set',
			'update',
		]),
	},
} as const

const decodeIdentity = (value: unknown, invalid: InvalidRestValue): string => {
	if (!isUuidV7(value)) throw invalid()
	return value
}

const decodeArray = (
	value: unknown,
	invalid: InvalidRestValue,
	decodeItem: (item: unknown) => unknown,
): unknown => {
	if (!isUnknownArray(value)) throw invalid()
	return immutableArray(value.map((item) => decodeItem(item)))
}

const decodeRelationCommand = (
	command: string,
	input: unknown,
	invalid: InvalidRestValue,
): unknown => {
	switch (command) {
		case 'connect':
		case 'disconnect':
		case 'set':
			return decodeArray(input, invalid, (item) =>
				decodeIdentity(item, invalid),
			)
		case 'create':
			// Core recursively transforms nested create data after this check.
			if (!isUnknownArray(input)) throw invalid()
			return input
		case 'update':
			return decodeArray(input, invalid, (item) => {
				if (!isPlainRecord(item)) throw invalid()
				return immutableRecord({
					...item,
					...(Object.hasOwn(item, 'id')
						? { id: decodeIdentity(item.id, invalid) }
						: {}),
				})
			})
	}
	// Core Runtime owns literal-true and replacement-exclusivity validation.
	return input
}

const decodeRelationshipCommands = (
	field: GenericField,
	kind: 'pointer' | 'relation',
	value: unknown,
	mode: 'create' | 'update',
	invalid: InvalidRestValue,
): unknown => {
	if (!isPlainRecord(value)) throw invalid()
	const commands = Object.entries(value)
	if (
		commands.length === 0 ||
		commands.some(([command]) => !nestedCommands[kind][mode].has(command)) ||
		getFieldSchemaTarget(field)?.() === undefined
	) {
		throw invalid()
	}
	return immutableRecord(
		Object.fromEntries(
			commands.map(([command, input]) => [
				command,
				kind === 'relation'
					? decodeRelationCommand(command, input, invalid)
					: command === 'connect'
						? decodeIdentity(input, invalid)
						: input,
			]),
		),
	)
}

// ADR-0307: a numeric field's object value is exactly one atomic operation.
const decodeNumericUpdate = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
): unknown => {
	if (
		getFieldListDepth(field.options) !== 0 ||
		!numericKinds.has(field.kind) ||
		!isPlainRecord(value)
	) {
		return undefined
	}
	const [kind, ...rest] = Object.keys(value)
	if (rest.length !== 0 || (kind !== 'increment' && kind !== 'decrement')) {
		throw invalid()
	}
	return immutableRecord({
		[kind]: decodeRestFieldValue(field, value[kind], invalid),
	})
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
	if (field.kind === 'pointer' || field.kind === 'relation') {
		// ADR-0243 keeps bulk and upsert roots flat.
		if (relationships === 'flat') throw invalid()
		return decodeRelationshipCommands(field, field.kind, value, mode, invalid)
	}
	if (mode === 'update') {
		const numeric = decodeNumericUpdate(field, value, invalid)
		if (numeric !== undefined) return numeric
	}
	return decodeRestFieldValue(field, value, invalid, 'value')
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
