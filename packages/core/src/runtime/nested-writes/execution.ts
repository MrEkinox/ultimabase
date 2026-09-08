import { immutableRecord } from '@ultimabase/shared'

import type { CreateOneOperationAst } from '../../query/operations/contracts.js'
import type { DatabaseMutationOperationAst } from '../database/contracts.js'
import { Pointer } from '../../schema/relations/pointer.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import type {
	NestedWriteGraph,
	NestedWriteObjectNode,
	NestedWriteRelationNode,
} from '../../schema/nested-writes/contracts.js'

/** Supplies only ordinary Runtime operations required by graph coordination. */
export interface RuntimeNestedWriteHost {
	connectRelation(
		relation: NestedWriteRelationNode,
		sourceId: string,
		targetIds: readonly string[],
	): Promise<void>
	executeCreate(
		node: NestedWriteObjectNode,
		injected?: Readonly<Record<string, unknown>>,
	): Promise<void>
	readInversePointerField(relation: NestedWriteRelationNode): string | undefined
	verifyTarget(pointer: Pointer): Promise<void>
}

const requireReservedId = (node: NestedWriteObjectNode): string => {
	if (node.reservedId === undefined) {
		throw new TypeError(
			'Runtime nested create is missing its reserved identity',
		)
	}
	return node.reservedId
}

const preflightConnectTargets = async (
	node: NestedWriteObjectNode,
	host: RuntimeNestedWriteHost,
): Promise<void> => {
	for (const relationship of node.relationships) {
		if (relationship.kind === 'pointer') {
			if (relationship.command === 'connect') {
				if (relationship.id === undefined) {
					throw new TypeError('Nested pointer connect is missing its target ID')
				}
				await host.verifyTarget(
					new Pointer(relationship.target, relationship.id),
				)
			}
			if (relationship.child !== undefined) {
				await preflightConnectTargets(relationship.child, host)
			}
			continue
		}

		if (relationship.command === 'connect') {
			for (const id of relationship.ids) {
				await host.verifyTarget(new Pointer(relationship.target, id))
			}
		}
		for (const child of relationship.children) {
			await preflightConnectTargets(child, host)
		}
	}
}

/** Coordinates one prepared graph while every object keeps its ordinary lifecycle. */
export class RuntimeNestedWriteCoordinator {
	readonly #graph: NestedWriteGraph
	readonly #host: RuntimeNestedWriteHost
	#preflightComplete = false

	constructor(graph: NestedWriteGraph, host: RuntimeNestedWriteHost) {
		this.#graph = graph
		this.#host = host
	}

	/** Runs global protected target reads, then target-before-source pointer creates. */
	async beforeMutation(node: NestedWriteObjectNode): Promise<void> {
		if (!this.#preflightComplete) {
			await preflightConnectTargets(this.#graph.root, this.#host)
			this.#preflightComplete = true
		}

		for (const relationship of node.relationships) {
			if (relationship.kind !== 'pointer') continue
			if (relationship.command === 'connect') continue
			if (
				relationship.command !== 'create' ||
				relationship.child === undefined
			) {
				throw new TypeError(
					`Nested create contains unsupported pointer command: ${relationship.command}`,
				)
			}
			await this.#host.executeCreate(relationship.child)
		}
	}

	/** Prevents input resolvers from redirecting a create away from its graph identity. */
	assertResolvedMutation(
		node: NestedWriteObjectNode,
		operation: DatabaseMutationOperationAst,
	): void {
		if (operation.kind !== 'create-one') {
			throw new TypeError(
				'Nested create resolved to a different operation kind',
			)
		}
		const create =
			operation as unknown as CreateOneOperationAst<SchemaDefinition>

		for (const relationship of node.relationships) {
			if (relationship.kind !== 'pointer') continue

			const expectedId =
				relationship.command === 'connect'
					? relationship.id
					: relationship.command === 'create'
						? relationship.child?.reservedId
						: undefined
			const candidate = create.input[relationship.fieldName]

			if (
				expectedId === undefined ||
				!Pointer.is(candidate) ||
				candidate.schema !== relationship.target ||
				candidate.id !== expectedId
			) {
				throw new TypeError(
					`Nested pointer resolution changed its graph target: ${node.schema.className}.${relationship.fieldName}`,
				)
			}
		}
	}

	/** Runs source-before-child relation creates and then protected membership work. */
	async afterMutation(
		node: NestedWriteObjectNode,
		sourceId: string,
	): Promise<void> {
		if (sourceId !== requireReservedId(node)) {
			throw new TypeError(
				'Nested create returned an unexpected object identity',
			)
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
									[mappedFieldName]: new Pointer(node.schema, sourceId),
								}),
					)
				}

				if (mappedFieldName === undefined) {
					await this.#host.connectRelation(
						relationship,
						sourceId,
						relationship.children.map(requireReservedId),
					)
				}
				continue
			}

			if (relationship.command === 'connect') {
				await this.#host.connectRelation(
					relationship,
					sourceId,
					relationship.ids,
				)
				continue
			}

			throw new TypeError(
				`Nested create contains unsupported relation command: ${relationship.command}`,
			)
		}
	}
}
