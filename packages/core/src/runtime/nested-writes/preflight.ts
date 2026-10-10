import { createPointer } from '../../schema/relations/pointer.js'
import { immutableRecord } from '@ultimabase/shared'

import { Pointer } from '../../schema/relations/pointer.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import type {
	NestedWriteGraph,
	NestedWriteObjectNode,
	NestedWriteRelationNode,
	NestedWriteRelationshipNode,
} from '../../schema/nested-writes/contracts.js'
import {
	createProtectedObjectNotFoundError,
	withLinkTargetNotFound,
} from '../operations/target-errors.js'
import type {
	RuntimeNestedWriteHost,
	RuntimeNestedWriteUpdateTarget,
} from './execution.js'

/** Reads one adapter-proven object identity from a protected preflight result. */
export const readNestedWriteRecordId = (
	record: Readonly<Record<string, unknown>>,
): string => {
	if (typeof record.id !== 'string') {
		throw new TypeError('Runtime nested update target is missing its object ID')
	}
	return record.id
}

/** Resolves the exact visible pointer that a nested pointer update may retain. */
export const requireNestedWriteCurrentPointer = (
	fieldName: string,
	target: SchemaDefinition,
	current: Readonly<Record<string, unknown>> | undefined,
): Pointer => {
	const candidate = current?.[fieldName]
	if (!Pointer.is(candidate) || candidate.schema !== target) {
		throw createProtectedObjectNotFoundError()
	}
	return candidate
}

/** Completes every protected target read before the first business Hook or write. */
export class RuntimeNestedWritePreflight {
	readonly #graph: NestedWriteGraph
	readonly #host: RuntimeNestedWriteHost
	readonly #relationTargets = new WeakMap<
		NestedWriteRelationNode,
		readonly Readonly<Record<string, unknown>>[]
	>()
	readonly #updateTargets = new WeakMap<
		NestedWriteObjectNode,
		RuntimeNestedWriteUpdateTarget
	>()
	#expandedOperationCount: number

	constructor(graph: NestedWriteGraph, host: RuntimeNestedWriteHost) {
		this.#graph = graph
		this.#host = host
		this.#expandedOperationCount = graph.operationCount
	}

	readRelationTargets(
		relation: NestedWriteRelationNode,
	): readonly Readonly<Record<string, unknown>>[] | undefined {
		return this.#relationTargets.get(relation)
	}

	readUpdateTarget(
		node: NestedWriteObjectNode,
	): RuntimeNestedWriteUpdateTarget | undefined {
		return this.#updateTargets.get(node)
	}

	/** Checks that every linked target is visible to the caller (ADR-0308). */
	async #verifyLink(
		relationship: NestedWriteRelationshipNode,
		ids: readonly string[],
	): Promise<void> {
		for (const id of ids) {
			await withLinkTargetNotFound(
				relationship.fieldName,
				relationship.target.className,
				() => this.#host.verifyTarget(createPointer(relationship.target, id)),
			)
		}
	}

	async run(current?: Readonly<Record<string, unknown>>): Promise<void> {
		if (this.#graph.root.command === 'update' && current !== undefined) {
			this.#updateTargets.set(
				this.#graph.root,
				immutableRecord({
					id: readNestedWriteRecordId(current),
					record: current,
				}),
			)
		}
		await this.#preflightNode(this.#graph.root, current)
	}

	async #preflightNode(
		node: NestedWriteObjectNode,
		current?: Readonly<Record<string, unknown>>,
	): Promise<void> {
		for (const relationship of node.relationships) {
			if (relationship.kind === 'pointer') {
				if (relationship.command === 'connect') {
					const { id } = relationship
					if (id === undefined) {
						throw new TypeError(
							'Nested pointer connect is missing its target ID',
						)
					}
					await this.#verifyLink(relationship, [id])
				} else if (relationship.command === 'update') {
					if (relationship.child === undefined) {
						throw new TypeError(
							'Nested pointer update is missing its child node',
						)
					}
					const pointer = requireNestedWriteCurrentPointer(
						relationship.fieldName,
						relationship.target,
						current,
					)
					const record = await this.#host.verifyTarget(pointer)
					this.#updateTargets.set(
						relationship.child,
						immutableRecord({ id: pointer.id, record }),
					)
					await this.#preflightNode(relationship.child, record)
				} else if (relationship.command === 'create') {
					if (relationship.child === undefined) {
						throw new TypeError(
							'Nested pointer create is missing its child node',
						)
					}
					await this.#preflightNode(relationship.child)
				}
				continue
			}

			if (relationship.command === 'create') {
				for (const child of relationship.children) {
					await this.#preflightNode(child)
				}
				continue
			}
			if (relationship.command === 'connect') {
				await this.#verifyLink(relationship, relationship.ids)
				continue
			}

			const sourceId =
				current === undefined ? undefined : readNestedWriteRecordId(current)
			if (sourceId === undefined) throw createProtectedObjectNotFoundError()

			if (
				relationship.command === 'update' ||
				relationship.command === 'disconnect'
			) {
				// A hidden member to disconnect is reported like a missing one.
				const records = await withLinkTargetNotFound(
					relationship.fieldName,
					relationship.target.className,
					() =>
						this.#host.readRelationTargets(
							relationship,
							sourceId,
							relationship.ids,
						),
				)
				if (relationship.command === 'update') {
					for (const [index, child] of relationship.children.entries()) {
						const record = records[index]
						const id = relationship.ids[index]
						if (record === undefined || id === undefined) {
							throw createProtectedObjectNotFoundError()
						}
						this.#updateTargets.set(
							child,
							immutableRecord({
								id,
								record,
								relation: immutableRecord({ node: relationship, sourceId }),
							}),
						)
						await this.#preflightNode(child, record)
					}
				}
				continue
			}

			if (relationship.command === 'set') {
				await this.#verifyLink(relationship, relationship.ids)
			}
			const records = await this.#host.readRelationTargets(
				relationship,
				sourceId,
			)
			this.#relationTargets.set(relationship, records)
			if (this.#host.isInversePointerRelation(relationship)) {
				this.#expandedOperationCount += records.length
				if (this.#expandedOperationCount > this.#graph.limits.maxOperations) {
					throw new TypeError(
						`Nested write exceeds maxOperations ${String(this.#graph.limits.maxOperations)}`,
					)
				}
			}
		}
	}
}
