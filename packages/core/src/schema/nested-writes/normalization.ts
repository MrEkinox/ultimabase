import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { isFieldNullable } from '../fields/base/options.js'
import type { GenericField } from '../fields/base/contract.js'
import { readFieldTypegenState } from '../fields/base/definition.js'
import type { ResolvedSchemaRelationMapping } from '../relations/mapping.js'
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
	failNestedWriteInput,
	formatNestedWriteInputPath,
	readNestedWriteId,
	readNestedWriteIds,
	snapshotNestedWriteInputValue,
	type InertNestedWriteRecord,
} from './input-validation.js'

type PointerCommand = NestedWritePointerNode['command']
type RelationCommand = NestedWriteRelationNode['command']

// Both lists are ordered: prefixes select the legal commands for each context, and
// relation commands are always normalized in this order regardless of key order.
const pointerCommands = [
	'connect',
	'create',
	'update',
	'disconnect',
] as const satisfies readonly PointerCommand[]
const relationCommands = [
	'create',
	'connect',
	'update',
	'disconnect',
	'set',
	'clear',
] as const satisfies readonly RelationCommand[]

type NestedWriteInput<
	TSchema extends SchemaDefinition,
	TCommand extends NestedWriteRootCommand,
> = TCommand extends 'create'
	? SchemaNestedCreateData<TSchema>
	: SchemaNestedUpdateData<TSchema>

/** Locates one relationship field of an object input while its commands are normalized. */
interface RelationshipSite {
	readonly declarationIndex: number
	readonly depth: number
	readonly field: GenericField
	readonly fieldName: string
	readonly inputPath: NestedWriteInputPath
	readonly rootCommand: NestedWriteRootCommand
	readonly source: SchemaDefinition
	readonly sourcePath: readonly string[]
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

const siteProvenance = (
	site: RelationshipSite,
	commandPath: NestedWriteInputPath,
): NestedWriteNodeProvenance =>
	createProvenance(
		site.source.provenance.fields[site.fieldName] ??
			site.source.provenance.schema,
		site.declarationIndex,
		commandPath,
		site.sourcePath,
	)

/** Validates that a command record is non-empty and uses only legal commands, in key order. */
const readCommandKeys = <TCommand extends string>(
	input: InertNestedWriteRecord,
	allowed: readonly TCommand[],
	path: NestedWriteInputPath,
): readonly TCommand[] => {
	const keys = Object.keys(input)
	if (keys.length === 0) failNestedWriteInput(path, 'must contain one command')

	return immutableArray(
		keys.map(
			(key) =>
				allowed.find((command) => command === key) ??
				failNestedWriteInput([...path, key], 'is not available'),
		),
	)
}

/**
 * Walks one caller input depth-first, allocating operation indexes in execution
 * order and failing on the first invalid value it reaches.
 */
class NestedWriteNormalizer {
	readonly limits: NestedWriteLimits
	operationCount = 0
	readonly #activeInputs = new WeakSet<object>()
	readonly #schemas: CompiledSchemaRegistry

	constructor(schemas: CompiledSchemaRegistry, limits: NestedWriteLimits) {
		this.#schemas = schemas
		this.limits = limits
	}

	normalizeObject(
		schema: SchemaDefinition,
		command: NestedWriteRootCommand,
		value: unknown,
		depth: number,
		inputPath: NestedWriteInputPath,
		sourcePath: readonly string[],
		declarationIndex: number,
	): NestedWriteObjectNode {
		if (depth > this.limits.maxDepth) {
			throw new TypeError(
				`Nested write exceeds maxDepth ${String(this.limits.maxDepth)} at ${formatNestedWriteInputPath(inputPath)}`,
			)
		}

		const input = assertInertNestedWriteRecord(value, inputPath)
		if (this.#activeInputs.has(input)) {
			failNestedWriteInput(inputPath, 'contains cyclic input')
		}
		this.#activeInputs.add(input)

		try {
			const operationIndex = this.#allocateOperation()
			const fieldEntries = Object.entries(schema.persistedFields)
			for (const key of Object.keys(input)) {
				if (!Object.hasOwn(schema.persistedFields, key)) {
					failNestedWriteInput([...inputPath, key], 'is unknown')
				}
			}

			if (command === 'update' && Object.keys(input).length === 0) {
				failNestedWriteInput(inputPath, 'must update one field')
			}

			const dataEntries: [string, unknown][] = []
			const relationships: NestedWriteRelationshipNode[] = []

			// Declaration order, not input key order, drives traversal and operation indexes.
			for (const [fieldIndex, [fieldName, field]] of fieldEntries.entries()) {
				if (!Object.hasOwn(input, fieldName)) continue
				const fieldPath = [...inputPath, fieldName]

				if (field.kind !== 'pointer' && field.kind !== 'relation') {
					dataEntries.push([
						fieldName,
						snapshotNestedWriteInputValue(input[fieldName], fieldPath),
					])
					continue
				}

				const site: RelationshipSite = {
					declarationIndex: fieldIndex,
					depth,
					field,
					fieldName,
					inputPath: fieldPath,
					rootCommand: command,
					source: schema,
					sourcePath: [...sourcePath, fieldName],
				}
				if (field.kind === 'pointer') {
					relationships.push(this.#normalizePointer(site, input[fieldName]))
				} else {
					relationships.push(...this.#normalizeRelation(site, input[fieldName]))
				}
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
			this.#activeInputs.delete(input)
		}
	}

	#allocateOperation(): number {
		const operationIndex = this.operationCount
		this.operationCount += 1

		if (this.operationCount > this.limits.maxOperations) {
			throw new TypeError(
				`Nested write exceeds maxOperations ${String(this.limits.maxOperations)}`,
			)
		}

		return operationIndex
	}

	#resolveTarget({ source, fieldName }: RelationshipSite): SchemaDefinition {
		const target = this.#schemas.schemaTargets.get(source, [fieldName])
		if (
			target === undefined ||
			this.#schemas.get(target.className) !== target
		) {
			throw new TypeError(
				`Nested-write target is missing or foreign: ${source.className}.${fieldName}`,
			)
		}

		return target
	}

	/** Reads the target pointer that stores this relation when it is that pointer's inverse. */
	#inversePointer({
		source,
		fieldName,
	}: RelationshipSite): ResolvedSchemaRelationMapping | undefined {
		const mappedBy = this.#schemas.schemaTargets.getRelation(source, [
			fieldName,
		])?.mappedBy

		return mappedBy?.kind === 'pointer' ? mappedBy : undefined
	}

	#normalizePointer(
		site: RelationshipSite,
		value: unknown,
	): NestedWritePointerNode {
		const { field, inputPath, rootCommand } = site
		if (readFieldTypegenState(field)[rootCommand] === 'forbidden') {
			failNestedWriteInput(inputPath, `is not available for ${rootCommand}`)
		}

		const input = assertInertNestedWriteRecord(value, inputPath)
		const allowed = pointerCommands.slice(
			0,
			rootCommand === 'create' ? 2 : isFieldNullable(field) ? 4 : 3,
		)
		const keys = readCommandKeys(input, allowed, inputPath)
		const [command] = keys
		if (command === undefined || keys.length !== 1) {
			return failNestedWriteInput(inputPath, 'must contain one pointer command')
		}

		const target = this.#resolveTarget(site)
		const commandPath = [...inputPath, command]
		let child: NestedWriteObjectNode | undefined
		let id: string | undefined

		if (command === 'connect') {
			id = readNestedWriteId(input[command], commandPath)
		} else if (command === 'disconnect') {
			if (input[command] !== true)
				failNestedWriteInput(commandPath, 'must be true')
		} else {
			child = this.normalizeObject(
				target,
				command,
				input[command],
				site.depth + 1,
				commandPath,
				site.sourcePath,
				site.declarationIndex,
			)
		}

		// Identity actions follow any child mutation; an update reuses the existing target.
		const actionOperationIndexes =
			command === 'update' ? [] : [this.#allocateOperation()]

		return immutableRecord({
			actionOperationIndexes: immutableArray(actionOperationIndexes),
			...(child === undefined ? {} : { child }),
			command,
			dependency: 'before-source' as const,
			depth: site.depth,
			field,
			fieldName: site.fieldName,
			...(id === undefined ? {} : { id }),
			input: child?.data ?? id ?? true,
			kind: 'pointer' as const,
			provenance: siteProvenance(site, commandPath),
			source: site.source,
			target,
		})
	}

	#normalizeRelation(
		site: RelationshipSite,
		value: unknown,
	): readonly NestedWriteRelationNode[] {
		const input = assertInertNestedWriteRecord(value, site.inputPath)
		const allowed: readonly RelationCommand[] =
			site.rootCommand === 'create'
				? relationCommands.slice(0, 2)
				: this.#relationCanDisconnect(site)
					? relationCommands
					: relationCommands.slice(0, 3)
		const keys = readCommandKeys(input, allowed, site.inputPath)

		if ((keys.includes('set') || keys.includes('clear')) && keys.length !== 1) {
			failNestedWriteInput(
				site.inputPath,
				'replacement command must be exclusive',
			)
		}

		const target = this.#resolveTarget(site)
		const seenIds = new Set<string>()

		return immutableArray(
			relationCommands
				.filter((command) => Object.hasOwn(input, command))
				.map((command) =>
					this.#normalizeRelationCommand(
						site,
						target,
						command,
						input[command],
						seenIds,
					),
				),
		)
	}

	/** Only a nullable inverse pointer can lose its source through disconnect, set, or clear. */
	#relationCanDisconnect(site: RelationshipSite): boolean {
		const mappedBy = this.#inversePointer(site)
		if (mappedBy === undefined) return true

		const mappedField =
			mappedBy.schema.persistedFields[mappedBy.fieldPath[0] ?? '']
		return mappedField === undefined || isFieldNullable(mappedField)
	}

	#normalizeRelationCommand(
		site: RelationshipSite,
		target: SchemaDefinition,
		command: RelationCommand,
		value: unknown,
		seenIds: Set<string>,
	): NestedWriteRelationNode {
		const commandPath = [...site.inputPath, command]
		const children: NestedWriteObjectNode[] = []
		const actionOperationIndexes: number[] = []
		let ids: readonly string[] = immutableArray([])
		let normalizedInput: unknown

		if (command === 'clear') {
			if (value !== true) failNestedWriteInput(commandPath, 'must be true')
			normalizedInput = true
			actionOperationIndexes.push(this.#allocateOperation())
		} else if (command === 'create') {
			const items = assertInertNestedWriteArray(value, commandPath, false)
			const injectedField = this.#inversePointer(site)?.fieldPath[0]
			for (const [index, item] of items.entries()) {
				const childPath = [...commandPath, index]
				const childInput = assertInertNestedWriteRecord(item, childPath)
				// The inverse pointer is filled with the new source, so callers cannot set it.
				if (
					injectedField !== undefined &&
					Object.hasOwn(childInput, injectedField)
				) {
					failNestedWriteInput(
						[...childPath, injectedField],
						'is injected by the inverse relation',
					)
				}
				children.push(
					this.normalizeObject(
						target,
						'create',
						childInput,
						site.depth + 1,
						childPath,
						site.sourcePath,
						index,
					),
				)
				actionOperationIndexes.push(this.#allocateOperation())
			}
			normalizedInput = immutableArray(children.map((child) => child.data))
		} else if (command === 'update') {
			const items = assertInertNestedWriteArray(value, commandPath, false)
			const normalizedItems = items.map((item, index) => {
				const itemPath = [...commandPath, index]
				const record = assertInertNestedWriteRecord(item, itemPath)
				const itemKeys = Object.keys(record)
				if (
					itemKeys.length !== 2 ||
					!itemKeys.includes('id') ||
					!itemKeys.includes('data')
				) {
					failNestedWriteInput(itemPath, 'must contain exactly id and data')
				}
				const id = readNestedWriteId(record.id, [...itemPath, 'id'])
				const child = this.normalizeObject(
					target,
					'update',
					record.data,
					site.depth + 1,
					[...itemPath, 'data'],
					site.sourcePath,
					index,
				)
				children.push(child)
				return immutableRecord({ data: child.data, id })
			})
			ids = immutableArray(normalizedItems.map((item) => item.id))
			normalizedInput = immutableArray(normalizedItems)
		} else {
			ids = readNestedWriteIds(value, commandPath, command === 'set')
			normalizedInput = ids
			actionOperationIndexes.push(...ids.map(() => this.#allocateOperation()))
		}

		// One object ID may be addressed by at most one command of the same relation.
		for (const id of ids) {
			if (seenIds.has(id)) {
				failNestedWriteInput(
					commandPath,
					`contradicts another command for object ID ${JSON.stringify(id)}`,
				)
			}
			seenIds.add(id)
		}

		return immutableRecord({
			actionOperationIndexes: immutableArray(actionOperationIndexes),
			children: immutableArray(children),
			command,
			dependency: 'after-source' as const,
			depth: site.depth,
			field: site.field,
			fieldName: site.fieldName,
			ids,
			input: normalizedInput,
			kind: 'relation' as const,
			provenance: siteProvenance(site, commandPath),
			source: site.source,
			target,
		})
	}
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

	const normalizer = new NestedWriteNormalizer(
		schemas,
		normalizeNestedWriteLimits(limits),
	)
	const root = normalizer.normalizeObject(
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
		limits: normalizer.limits,
		operationCount: normalizer.operationCount,
		root,
	})
}
