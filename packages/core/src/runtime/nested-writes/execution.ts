import { createPointer } from '../../schema/relations/pointer.js'
import { immutableRecord } from '@ultimabase/shared'

import type {
	CreateOneOperationAst,
	UpdateOneOperationAst,
} from '../../query/operations/contracts.js'
import type { DatabaseMutationOperationAst } from '../database/contracts.js'
import type { Pointer } from '../../schema/relations/pointer.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import type {
	NestedWriteGraph,
	NestedWriteObjectNode,
	NestedWriteRelationNode,
} from '../../schema/nested-writes/contracts.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import {
	createRuntimeNestedUpdateOperation,
	readNestedPointerTarget,
} from './preparation.js'
import {
	readNestedWriteRecordId,
	requireNestedWriteCurrentPointer,
	RuntimeNestedWritePreflight,
} from './preflight.js'

/** Identifies one preflighted update target and its optional source membership. */
export interface RuntimeNestedWriteUpdateTarget {
	readonly id: string
	readonly record: Readonly<Record<string, unknown>>
	readonly relation?: Readonly<{
		readonly node: NestedWriteRelationNode
		readonly sourceId: string
	}>
}

/** Supplies only ordinary Runtime operations required by graph coordination. */
export interface RuntimeNestedWriteHost {
	executeCreate(
		node: NestedWriteObjectNode,
		injected?: Readonly<Record<string, unknown>>,
	): Promise<void>
	executeUpdate(
		node: NestedWriteObjectNode,
		target: RuntimeNestedWriteUpdateTarget,
	): Promise<void>
	isInversePointerRelation(relation: NestedWriteRelationNode): boolean
	mutateRelation(
		relation: NestedWriteRelationNode,
		sourceId: string,
		action: 'connect' | 'disconnect',
		targetIds: readonly string[],
	): Promise<void>
	readInversePointerField(relation: NestedWriteRelationNode): string | undefined
	readRelationTargets(
		relation: NestedWriteRelationNode,
		sourceId: string,
		targetIds?: readonly string[],
	): Promise<readonly Readonly<Record<string, unknown>>[]>
	verifyTarget(pointer: Pointer): Promise<Readonly<Record<string, unknown>>>
}

const requireReservedId = (node: NestedWriteObjectNode): string => {
	if (node.reservedId === undefined) {
		throw new TypeError(
			'Runtime nested create is missing its reserved identity',
		)
	}
	return node.reservedId
}

const readUpdateFieldValue = (
	operation: UpdateOneOperationAst<SchemaDefinition>,
	fieldName: string,
): unknown => {
	const matches = operation.update.operations.filter(
		(candidate) => candidate.field === fieldName && candidate.kind === 'set',
	)
	if (matches.length !== 1) return undefined
	return matches[0]?.value
}

/** Coordinates one prepared graph while every object keeps its ordinary lifecycle. */
export class RuntimeNestedWriteCoordinator {
	readonly #graph: NestedWriteGraph
	readonly #host: RuntimeNestedWriteHost
	readonly #preflight: RuntimeNestedWritePreflight
	#preflightComplete = false
	#rootMissing = false

	constructor(graph: NestedWriteGraph, host: RuntimeNestedWriteHost) {
		this.#graph = graph
		this.#host = host
		this.#preflight = new RuntimeNestedWritePreflight(graph, host)
	}

	/** Runs global preflight, then target-before-source pointer work. */
	async beforeMutation(
		node: NestedWriteObjectNode,
		operation: DatabaseMutationOperationAst,
		current: Readonly<Record<string, unknown>> | null | undefined,
	): Promise<DatabaseMutationOperationAst> {
		if (node.command === 'update' && current === null) {
			if (node === this.#graph.root) this.#rootMissing = true
			return operation
		}
		if (node.command === 'update' && current === undefined) {
			throw new TypeError('Nested update did not receive its prepared target')
		}

		if (!this.#preflightComplete) {
			await this.#preflight.run(current ?? undefined)
			this.#preflightComplete = true
		}

		if (
			node.command === 'update' &&
			current !== undefined &&
			current !== null
		) {
			const expected = this.#preflight.readUpdateTarget(node)
			if (expected?.id !== readNestedWriteRecordId(current)) {
				throw createProtectedObjectNotFoundError()
			}
		}

		for (const relationship of node.relationships) {
			if (relationship.kind !== 'pointer') continue
			if (relationship.command === 'create') {
				if (relationship.child === undefined) {
					throw new TypeError('Nested pointer create is missing its child node')
				}
				await this.#host.executeCreate(relationship.child)
			} else if (relationship.command === 'update') {
				if (relationship.child === undefined) {
					throw new TypeError('Nested pointer update is missing its child node')
				}
				const target = this.#preflight.readUpdateTarget(relationship.child)
				if (target === undefined) throw createProtectedObjectNotFoundError()
				await this.#host.executeUpdate(relationship.child, target)
			}
		}

		return node.command === 'update' &&
			current !== null &&
			current !== undefined
			? createRuntimeNestedUpdateOperation(
					operation as UpdateOneOperationAst<SchemaDefinition>,
					node,
					current,
				)
			: operation
	}

	/** Prevents input resolvers from redirecting a mutation away from its graph. */
	assertResolvedMutation(
		node: NestedWriteObjectNode,
		operation: DatabaseMutationOperationAst,
	): void {
		if (operation.kind !== `${node.command}-one`) {
			throw new TypeError(
				`Nested ${node.command} resolved to a different operation kind`,
			)
		}
		// The kind check above proves the exact singular operation shape.
		const create =
			node.command === 'create'
				? (operation as unknown as CreateOneOperationAst<SchemaDefinition>)
				: undefined
		const update = operation as UpdateOneOperationAst<SchemaDefinition>
		const current =
			create === undefined
				? this.#preflight.readUpdateTarget(node)?.record
				: undefined

		for (const relationship of node.relationships) {
			if (relationship.kind !== 'pointer') continue
			const target = readNestedPointerTarget(relationship)
			const expected =
				create !== undefined || target !== undefined
					? target
					: relationship.command === 'disconnect'
						? null
						: relationship.command === 'update'
							? requireNestedWriteCurrentPointer(
									relationship.fieldName,
									relationship.target,
									current,
								)
							: undefined
			const candidate =
				create === undefined
					? readUpdateFieldValue(update, relationship.fieldName)
					: create.input[relationship.fieldName]
			if (
				expected === undefined ||
				(expected === null ? candidate !== null : !expected.equals(candidate))
			) {
				throw new TypeError(
					`Nested pointer resolution changed its graph target: ${node.schema.className}.${relationship.fieldName}`,
				)
			}
		}
	}

	/** Runs source-before-child relation work before the root after lifecycle. */
	async afterMutation(
		node: NestedWriteObjectNode,
		sourceId: string | undefined,
	): Promise<void> {
		if (
			sourceId === undefined &&
			this.#rootMissing &&
			node === this.#graph.root
		) {
			return
		}
		if (sourceId === undefined) {
			throw createProtectedObjectNotFoundError()
		}
		const expectedId =
			node.command === 'create'
				? requireReservedId(node)
				: this.#preflight.readUpdateTarget(node)?.id
		if (sourceId !== expectedId) {
			throw new TypeError('Nested write returned an unexpected object identity')
		}

		for (const relationship of node.relationships) {
			if (relationship.kind !== 'relation') continue

			if (relationship.command === 'create') {
				const mappedFieldName = this.#host.readInversePointerField(relationship)
				for (const child of relationship.children) {
					await this.#host.executeCreate(
						child,
						mappedFieldName === undefined
							? undefined
							: immutableRecord({
									[mappedFieldName]: createPointer(node.schema, sourceId),
								}),
					)
				}
				if (mappedFieldName === undefined) {
					await this.#host.mutateRelation(
						relationship,
						sourceId,
						'connect',
						relationship.children.map(requireReservedId),
					)
				}
				continue
			}

			if (relationship.command === 'connect') {
				await this.#host.mutateRelation(
					relationship,
					sourceId,
					'connect',
					relationship.ids,
				)
				continue
			}

			if (relationship.command === 'update') {
				for (const child of relationship.children) {
					const target = this.#preflight.readUpdateTarget(child)
					if (target === undefined) throw createProtectedObjectNotFoundError()
					await this.#host.executeUpdate(child, target)
				}
				continue
			}

			if (relationship.command === 'disconnect') {
				await this.#host.mutateRelation(
					relationship,
					sourceId,
					'disconnect',
					relationship.ids,
				)
				continue
			}

			const current = this.#preflight.readRelationTargets(relationship)
			if (current === undefined) {
				throw new TypeError('Nested relation replacement was not preflighted')
			}
			// Only `set` remains: it replaces the visible membership (ADR-0308).
			const currentIds = current.map(readNestedWriteRecordId)
			const requestedIds = relationship.ids
			const requested = new Set(requestedIds)
			const existing = new Set(currentIds)
			await this.#host.mutateRelation(
				relationship,
				sourceId,
				'disconnect',
				currentIds.filter((id) => !requested.has(id)),
			)
			await this.#host.mutateRelation(
				relationship,
				sourceId,
				'connect',
				requestedIds.filter((id) => !existing.has(id)),
			)
		}
	}
}
