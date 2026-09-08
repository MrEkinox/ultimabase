import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { createQueryAst } from '../../query/ast/factory.js'
import type { CreateOneOperationAst } from '../../query/operations/contracts.js'
import { Pointer } from '../../schema/relations/pointer.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import type {
	NestedWriteGraph,
	NestedWriteObjectNode,
	NestedWriteRelationshipNode,
} from '../../schema/nested-writes/contracts.js'
import { normalizeNestedWriteGraph } from '../../schema/nested-writes/normalization.js'
import type { RuntimeNestedWriteBinding } from './binding.js'
import { retainReservedCreateId } from './reserved-create.js'

const prepareObjectNode = (
	node: NestedWriteObjectNode,
	reserveId: () => string,
): NestedWriteObjectNode => {
	const relationships: NestedWriteRelationshipNode[] = node.relationships.map(
		(relationship): NestedWriteRelationshipNode => {
			if (relationship.kind === 'pointer') {
				const child =
					relationship.child === undefined
						? undefined
						: prepareObjectNode(relationship.child, reserveId)
				return immutableRecord({
					...relationship,
					...(child === undefined ? {} : { child }),
				})
			}

			return immutableRecord({
				...relationship,
				children: immutableArray(
					relationship.children.map((child) =>
						prepareObjectNode(child, reserveId),
					),
				),
			})
		},
	)

	return immutableRecord({
		...node,
		relationships: immutableArray(relationships),
		reservedId: reserveId(),
	})
}

/** Reserves every create identity before the first nested Runtime effect. */
export const prepareRuntimeNestedWriteGraph = (
	operation: CreateOneOperationAst<SchemaDefinition>,
	binding: RuntimeNestedWriteBinding,
): NestedWriteGraph => {
	const normalized = normalizeNestedWriteGraph(
		binding.schemas,
		operation.schema.definition,
		'create',
		operation.input,
		binding.limits,
	)

	return immutableRecord({
		...normalized,
		root: prepareObjectNode(normalized.root, binding.reserveId),
	})
}

/** Materializes only scalar data and resolved pointer candidates for validation. */
export const createRuntimeNestedCreateInput = (
	node: NestedWriteObjectNode,
	injected: Readonly<Record<string, unknown>> = immutableRecord({}),
): Readonly<Record<string, unknown>> => {
	const input: Record<string, unknown> = { ...node.data, ...injected }

	for (const relationship of node.relationships) {
		if (relationship.kind !== 'pointer') continue

		if (relationship.command === 'connect' && relationship.id !== undefined) {
			input[relationship.fieldName] = new Pointer(
				relationship.target,
				relationship.id,
			)
			continue
		}

		if (
			relationship.command === 'create' &&
			relationship.child?.reservedId !== undefined
		) {
			input[relationship.fieldName] = new Pointer(
				relationship.target,
				relationship.child.reservedId,
			)
			continue
		}

		throw new TypeError(
			`Nested create contains unsupported pointer command: ${relationship.command}`,
		)
	}

	return immutableRecord(input)
}

/** Creates one child operation while retaining its framework-reserved identity. */
export const createRuntimeNestedCreateOperation = (
	operation: CreateOneOperationAst<SchemaDefinition>,
	node: NestedWriteObjectNode,
	injected?: Readonly<Record<string, unknown>>,
): CreateOneOperationAst<SchemaDefinition> => {
	if (node.command !== 'create' || node.reservedId === undefined) {
		throw new TypeError('Nested-write child must be a prepared create node')
	}

	return retainReservedCreateId(
		immutableRecord({
			...operation,
			input: createRuntimeNestedCreateInput(node, injected),
			schema: createQueryAst(node.schema).schema,
		}),
		node.reservedId,
	)
}
