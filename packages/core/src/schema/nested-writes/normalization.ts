import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { isFieldNullable } from '../fields/base/options.js'
import type { GenericField } from '../fields/base/contract.js'
import { readFieldTypegenState } from '../fields/base/definition.js'
import { Schema, type SchemaDefinition } from '../schema/definition.js'
import type { CompiledSchemaRegistry } from '../schema/registry.js'
import type {
	NestedWriteGraph,
	NestedWriteInputPath,
	NestedWriteLimits,
	NestedWriteNodeProvenance,
	NestedWriteObjectNode,
	NestedWritePointerNode,
	NestedWriteRelationNode,
	NestedWriteRelationshipNode,
	NestedWriteRootCommand,
} from './contracts.js'
import {
	defaultNestedWriteLimits,
	normalizeNestedWriteLimits,
} from './limits.js'
import type {
	SchemaNestedCreateData,
	SchemaNestedUpdateData,
} from './inputs.js'
import {
	assertInertNestedWriteArray,
	assertInertNestedWriteRecord,
	formatNestedWriteInputPath,
	readNestedWriteId,
	readNestedWriteIds,
	snapshotNestedWriteInputValue,
	type InertNestedWriteRecord,
} from './input-validation.js'

const pointerCommands = ['connect', 'create', 'update', 'disconnect'] as const
const relationCreateCommands = ['create', 'connect'] as const
const relationUpdateCommands = [
	'create',
	'connect',
	'update',
	'disconnect',
	'set',
	'clear',
] as const

interface NormalizationState {
	readonly activeInputs: WeakSet<object>
	readonly limits: NestedWriteLimits
	readonly schemas: CompiledSchemaRegistry
	nextOperationIndex: number
}

type NestedWriteInput<
	TSchema extends SchemaDefinition,
	TCommand extends NestedWriteRootCommand,
> = TCommand extends 'create'
	? SchemaNestedCreateData<TSchema>
	: SchemaNestedUpdateData<TSchema>

const allocateOperation = (state: NormalizationState): number => {
	const operationIndex = state.nextOperationIndex
	state.nextOperationIndex += 1

	if (state.nextOperationIndex > state.limits.maxOperations) {
		throw new TypeError(
			`Nested write exceeds maxOperations ${String(state.limits.maxOperations)}`,
		)
	}

	return operationIndex
}

const createProvenance = (
	contribution: NestedWriteNodeProvenance['contribution'],
	declarationIndex: number,
	inputPath: NestedWriteInputPath,
	sourcePath: readonly string[],
): NestedWriteNodeProvenance =>
	immutableRecord({
		contribution,
		declarationIndex,
		inputPath: immutableArray(inputPath),
		sourcePath: immutableArray(sourcePath),
	})

const resolveTarget = (
	state: NormalizationState,
	source: SchemaDefinition,
	fieldName: string,
): SchemaDefinition => {
	const target = state.schemas.schemaTargets.get(source, [fieldName])
	if (target === undefined || state.schemas.get(target.className) !== target) {
		throw new TypeError(
			`Nested-write target is missing or foreign: ${source.className}.${fieldName}`,
		)
	}

	return target
}

const assertKnownCommandKeys = (
	input: InertNestedWriteRecord,
	allowed: readonly string[],
	path: NestedWriteInputPath,
): readonly string[] => {
	const keys = Object.keys(input)
	if (keys.length === 0) {
		throw new TypeError(
			`${formatNestedWriteInputPath(path)} must contain one command`,
		)
	}

	for (const key of keys) {
		if (!allowed.includes(key)) {
			throw new TypeError(
				`${formatNestedWriteInputPath([...path, key])} is not available`,
			)
		}
	}

	return immutableArray(keys)
}

const relationCanDisconnect = (
	state: NormalizationState,
	source: SchemaDefinition,
	fieldName: string,
): boolean => {
	const relation = state.schemas.schemaTargets.getRelation(source, [fieldName])
	const mappedBy = relation?.mappedBy
	if (mappedBy?.kind !== 'pointer') return true

	const mappedField =
		mappedBy.schema.persistedFields[mappedBy.fieldPath[0] ?? '']
	return mappedField === undefined || isFieldNullable(mappedField)
}

const assertContextualCreateFieldAbsent = (
	state: NormalizationState,
	source: SchemaDefinition,
	fieldName: string,
	input: InertNestedWriteRecord,
	path: NestedWriteInputPath,
): void => {
	const mappedBy = state.schemas.schemaTargets.getRelation(source, [
		fieldName,
	])?.mappedBy
	const mappedFieldName = mappedBy?.fieldPath[0]

	if (
		mappedBy?.kind === 'pointer' &&
		mappedFieldName !== undefined &&
		Object.hasOwn(input, mappedFieldName)
	) {
		throw new TypeError(
			`${formatNestedWriteInputPath([...path, mappedFieldName])} is injected by the inverse relation`,
		)
	}
}

const normalizeObjectNode = (
	state: NormalizationState,
	schema: SchemaDefinition,
	command: NestedWriteRootCommand,
	value: unknown,
	depth: number,
	inputPath: NestedWriteInputPath,
	sourcePath: readonly string[],
	declarationIndex: number,
): NestedWriteObjectNode => {
	if (depth > state.limits.maxDepth) {
		throw new TypeError(
			`Nested write exceeds maxDepth ${String(state.limits.maxDepth)} at ${formatNestedWriteInputPath(inputPath)}`,
		)
	}

	const input = assertInertNestedWriteRecord(value, inputPath)
	if (state.activeInputs.has(input)) {
		throw new TypeError(
			`${formatNestedWriteInputPath(inputPath)} contains cyclic input`,
		)
	}
	state.activeInputs.add(input)

	try {
		const operationIndex = allocateOperation(state)
		const fieldEntries = Object.entries(schema.persistedFields)
		const knownFields = new Set(fieldEntries.map(([fieldName]) => fieldName))
		for (const key of Object.keys(input)) {
			if (!knownFields.has(key)) {
				throw new TypeError(
					`${formatNestedWriteInputPath([...inputPath, key])} is unknown`,
				)
			}
		}

		if (command === 'update' && Object.keys(input).length === 0) {
			throw new TypeError(
				`${formatNestedWriteInputPath(inputPath)} must update one field`,
			)
		}

		const dataEntries: [string, unknown][] = []
		const relationships: NestedWriteRelationshipNode[] = []

		for (const [fieldName, field] of fieldEntries) {
			if (!Object.hasOwn(input, fieldName)) continue
			const fieldPath = [...inputPath, fieldName]
			const nextSourcePath = [...sourcePath, fieldName]
			const fieldIndex = fieldEntries.findIndex(([name]) => name === fieldName)

			if (field.kind === 'pointer') {
				relationships.push(
					normalizePointerNode(
						state,
						schema,
						field,
						fieldName,
						command,
						input[fieldName],
						depth,
						fieldPath,
						nextSourcePath,
						fieldIndex,
					),
				)
				continue
			}

			if (field.kind === 'relation') {
				relationships.push(
					...normalizeRelationNodes(
						state,
						schema,
						field,
						fieldName,
						command,
						input[fieldName],
						depth,
						fieldPath,
						nextSourcePath,
						fieldIndex,
					),
				)
				continue
			}

			dataEntries.push([
				fieldName,
				snapshotNestedWriteInputValue(input[fieldName], fieldPath),
			])
		}

		return immutableRecord({
			command,
			data: immutableRecord(Object.fromEntries(dataEntries)),
			depth,
			kind: 'object' as const,
			operationIndex,
			provenance: createProvenance(
				schema.provenance.schema,
				declarationIndex,
				inputPath,
				sourcePath,
			),
			relationships: immutableArray(relationships),
			schema,
		})
	} finally {
		state.activeInputs.delete(input)
	}
}

const normalizePointerNode = (
	state: NormalizationState,
	source: SchemaDefinition,
	field: GenericField,
	fieldName: string,
	rootCommand: NestedWriteRootCommand,
	value: unknown,
	depth: number,
	inputPath: NestedWriteInputPath,
	sourcePath: readonly string[],
	declarationIndex: number,
): NestedWritePointerNode => {
	const fieldTypegen = readFieldTypegenState(field)
	if (
		(rootCommand === 'create' && fieldTypegen.create === 'forbidden') ||
		(rootCommand === 'update' && fieldTypegen.update === 'forbidden')
	) {
		throw new TypeError(
			`${formatNestedWriteInputPath(inputPath)} is not available for ${rootCommand}`,
		)
	}

	const input = assertInertNestedWriteRecord(value, inputPath)
	const allowed =
		rootCommand === 'create'
			? pointerCommands.slice(0, 2)
			: isFieldNullable(field)
				? pointerCommands
				: pointerCommands.slice(0, 3)
	const keys = assertKnownCommandKeys(input, allowed, inputPath)
	if (keys.length !== 1) {
		throw new TypeError(
			`${formatNestedWriteInputPath(inputPath)} must contain one pointer command`,
		)
	}

	const command = keys[0]
	if (
		command !== 'connect' &&
		command !== 'create' &&
		command !== 'disconnect' &&
		command !== 'update'
	) {
		throw new TypeError(
			`${formatNestedWriteInputPath(inputPath)} has an invalid pointer command`,
		)
	}

	const target = resolveTarget(state, source, fieldName)
	const commandPath = [...inputPath, command]
	let child: NestedWriteObjectNode | undefined
	let id: string | undefined
	let normalizedInput: unknown
	const actionOperationIndexes: number[] = []

	if (command === 'connect') {
		id = readNestedWriteId(input[command], commandPath)
		normalizedInput = id
		actionOperationIndexes.push(allocateOperation(state))
	} else if (command === 'disconnect') {
		if (input[command] !== true) {
			throw new TypeError(
				`${formatNestedWriteInputPath(commandPath)} must be true`,
			)
		}
		normalizedInput = true
		actionOperationIndexes.push(allocateOperation(state))
	} else {
		child = normalizeObjectNode(
			state,
			target,
			command,
			input[command],
			depth + 1,
			commandPath,
			sourcePath,
			declarationIndex,
		)
		normalizedInput = child.data
		if (command === 'create') {
			actionOperationIndexes.push(allocateOperation(state))
		}
	}

	return immutableRecord({
		actionOperationIndexes: immutableArray(actionOperationIndexes),
		...(child === undefined ? {} : { child }),
		command,
		dependency: 'before-source' as const,
		depth,
		field,
		fieldName,
		...(id === undefined ? {} : { id }),
		input: normalizedInput,
		kind: 'pointer' as const,
		provenance: createProvenance(
			source.provenance.fields[fieldName] ?? source.provenance.schema,
			declarationIndex,
			commandPath,
			sourcePath,
		),
		source,
		target,
	})
}

const normalizeRelationNodes = (
	state: NormalizationState,
	source: SchemaDefinition,
	field: GenericField,
	fieldName: string,
	rootCommand: NestedWriteRootCommand,
	value: unknown,
	depth: number,
	inputPath: NestedWriteInputPath,
	sourcePath: readonly string[],
	declarationIndex: number,
): readonly NestedWriteRelationNode[] => {
	const input = assertInertNestedWriteRecord(value, inputPath)
	const canDisconnect = relationCanDisconnect(state, source, fieldName)
	const allowed =
		rootCommand === 'create'
			? relationCreateCommands
			: canDisconnect
				? relationUpdateCommands
				: relationUpdateCommands.slice(0, 3)
	const keys = assertKnownCommandKeys(input, allowed, inputPath)

	if ((keys.includes('set') || keys.includes('clear')) && keys.length !== 1) {
		throw new TypeError(
			`${formatNestedWriteInputPath(inputPath)} replacement command must be exclusive`,
		)
	}

	const target = resolveTarget(state, source, fieldName)
	const seenIds = new Set<string>()
	const nodes: NestedWriteRelationNode[] = []
	const commandOrder =
		rootCommand === 'create' ? relationCreateCommands : relationUpdateCommands

	for (const command of commandOrder) {
		if (!Object.hasOwn(input, command)) continue
		const commandPath = [...inputPath, command]
		const children: NestedWriteObjectNode[] = []
		const actionOperationIndexes: number[] = []
		let ids: readonly string[] = immutableArray([])
		let normalizedInput: unknown

		if (command === 'clear') {
			if (input[command] !== true) {
				throw new TypeError(
					`${formatNestedWriteInputPath(commandPath)} must be true`,
				)
			}
			normalizedInput = true
			actionOperationIndexes.push(allocateOperation(state))
		} else if (command === 'create') {
			const createInputs = assertInertNestedWriteArray(
				input[command],
				commandPath,
				false,
			)
			for (let index = 0; index < createInputs.length; index += 1) {
				const childPath = [...commandPath, index]
				const childInput = assertInertNestedWriteRecord(
					createInputs[index],
					childPath,
				)
				assertContextualCreateFieldAbsent(
					state,
					source,
					fieldName,
					childInput,
					childPath,
				)
				children.push(
					normalizeObjectNode(
						state,
						target,
						'create',
						childInput,
						depth + 1,
						childPath,
						sourcePath,
						index,
					),
				)
				actionOperationIndexes.push(allocateOperation(state))
			}
			normalizedInput = immutableArray(children.map((child) => child.data))
		} else if (command === 'update') {
			const updateInputs = assertInertNestedWriteArray(
				input[command],
				commandPath,
				false,
			)
			const normalizedItems: InertNestedWriteRecord[] = []
			const mutableIds: string[] = []
			for (let index = 0; index < updateInputs.length; index += 1) {
				const itemPath = [...commandPath, index]
				const item = assertInertNestedWriteRecord(updateInputs[index], itemPath)
				const itemKeys = Object.keys(item)
				if (
					itemKeys.length !== 2 ||
					!itemKeys.includes('id') ||
					!itemKeys.includes('data')
				) {
					throw new TypeError(
						`${formatNestedWriteInputPath(itemPath)} must contain exactly id and data`,
					)
				}
				const id = readNestedWriteId(item.id, [...itemPath, 'id'])
				mutableIds.push(id)
				const child = normalizeObjectNode(
					state,
					target,
					'update',
					item.data,
					depth + 1,
					[...itemPath, 'data'],
					sourcePath,
					index,
				)
				children.push(child)
				normalizedItems.push(immutableRecord({ data: child.data, id }))
			}
			ids = immutableArray(mutableIds)
			normalizedInput = immutableArray(normalizedItems)
		} else {
			ids = readNestedWriteIds(input[command], commandPath, command === 'set')
			normalizedInput = ids
			actionOperationIndexes.push(...ids.map(() => allocateOperation(state)))
		}

		for (const id of ids) {
			if (seenIds.has(id)) {
				throw new TypeError(
					`${formatNestedWriteInputPath(commandPath)} contradicts another command for object ID ${JSON.stringify(id)}`,
				)
			}
			seenIds.add(id)
		}

		nodes.push(
			immutableRecord({
				actionOperationIndexes: immutableArray(actionOperationIndexes),
				children: immutableArray(children),
				command,
				dependency: 'after-source' as const,
				depth,
				field,
				fieldName,
				ids,
				input: normalizedInput,
				kind: 'relation' as const,
				provenance: createProvenance(
					source.provenance.fields[fieldName] ?? source.provenance.schema,
					declarationIndex,
					commandPath,
					sourcePath,
				),
				source,
				target,
			}),
		)
	}

	return immutableArray(nodes)
}

/**
 * Normalizes one singular schema mutation without opening Runtime or executing effects.
 *
 * The compiled registry supplies application ownership and exact relationship targets,
 * so JavaScript callers receive the same graph without generated declarations.
 */
export const normalizeNestedWriteGraph = <
	const TSchema extends SchemaDefinition,
	const TCommand extends NestedWriteRootCommand,
>(
	schemas: CompiledSchemaRegistry,
	schema: TSchema,
	command: TCommand,
	input: NestedWriteInput<TSchema, TCommand>,
	limits: Partial<NestedWriteLimits> = defaultNestedWriteLimits,
): NestedWriteGraph => {
	if (!Schema.is(schema) || schemas.get(schema.className) !== schema) {
		throw new TypeError(
			'Nested-write root schema must belong to the application',
		)
	}

	const normalizedLimits = normalizeNestedWriteLimits(limits)
	const state: NormalizationState = {
		activeInputs: new WeakSet(),
		limits: normalizedLimits,
		nextOperationIndex: 0,
		schemas,
	}
	const root = normalizeObjectNode(
		state,
		schema,
		command,
		input,
		0,
		immutableArray(['data']),
		immutableArray([]),
		0,
	)

	return immutableRecord({
		kind: 'nested-write-graph' as const,
		limits: normalizedLimits,
		operationCount: state.nextOperationIndex,
		root,
	})
}
