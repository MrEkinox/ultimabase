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

import { decodeRestFieldValue, type InvalidRestValue } from './field-values.js'
import { isUuidV7 } from './read-values.js'

type MutationDataMode = 'create' | 'update'
type RelationshipInputMode = 'flat' | 'nested'

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
): SchemaDefinition => {
	const target = getFieldSchemaTarget(field)?.()
	if (target === undefined) throw invalid()
	return target
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
	mode: MutationDataMode,
	invalid: InvalidRestValue,
): unknown => {
	const commands = assertKnownCommands(
		value,
		mode === 'create' ? pointerCreateCommands : pointerUpdateCommands,
		invalid,
	)
	const target = requireTarget(field, invalid)
	const decoded: Record<string, unknown> = {}

	for (const [command, input] of Object.entries(commands)) {
		if (command === 'connect') {
			decoded[command] = decodeIdentity(input, invalid)
		} else if (command === 'create') {
			decoded[command] = decodeRestMutationData(
				target,
				input,
				'create',
				'nested',
				invalid,
			)
		} else if (command === 'update') {
			decoded[command] = decodeRestMutationData(
				target,
				input,
				'update',
				'nested',
				invalid,
			)
		} else {
			// Core owns the literal-true and command-exclusivity validation.
			decoded[command] = input
		}
	}

	return immutableRecord(decoded)
}

const decodeRelationUpdateItems = (
	target: SchemaDefinition,
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
				...(Object.hasOwn(item, 'data')
					? {
							data: decodeRestMutationData(
								target,
								item.data,
								'update',
								'nested',
								invalid,
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
	mode: MutationDataMode,
	invalid: InvalidRestValue,
): unknown => {
	const commands = assertKnownCommands(
		value,
		mode === 'create' ? relationCreateCommands : relationUpdateCommands,
		invalid,
	)
	const target = requireTarget(field, invalid)
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
			decoded[command] = immutableArray(
				input.map((item) =>
					decodeRestMutationData(target, item, 'create', 'nested', invalid),
				),
			)
		} else if (command === 'update') {
			decoded[command] = decodeRelationUpdateItems(target, input, invalid)
		} else {
			// Core owns the literal-true and replacement-exclusivity validation.
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

/** Decodes one mutation data object while keeping nested commands declarative. */
export const decodeRestMutationData = (
	schema: SchemaDefinition,
	value: unknown,
	mode: MutationDataMode,
	relationships: RelationshipInputMode,
	invalid: InvalidRestValue,
): unknown => {
	if (!isPlainRecord(value)) return value

	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([name, item]) => {
				if (Object.hasOwn(schema.virtualFields, name)) throw invalid()
				const field: GenericField | undefined = schema.persistedFields[name]
				if (field === undefined) return [name, item]

				if (relationships === 'nested' && field.kind === 'pointer') {
					return [name, decodePointerCommands(field, item, mode, invalid)]
				}
				if (relationships === 'nested' && field.kind === 'relation') {
					return [name, decodeRelationCommands(field, item, mode, invalid)]
				}
				if (
					relationships === 'flat' &&
					(field.kind === 'pointer' || field.kind === 'relation')
				) {
					// ADR-0243 removes the former tagged pointer mutation alias. Flat
					// roots do not gain nested relationships in this milestone.
					throw invalid()
				}

				if (mode === 'update') {
					const numeric = decodeNumericUpdate(field, item, invalid)
					if (numeric !== undefined) return [name, numeric]
				}

				return [
					name,
					decodeRestFieldValue(field, item, invalid, false, 'value'),
				]
			}),
		),
	)
}
