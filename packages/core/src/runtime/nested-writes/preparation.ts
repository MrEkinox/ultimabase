import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import { createQueryAst } from '../../query/ast/factory.js'
import type {
	CreateOneOperationAst,
	UpdateOneOperationAst,
} from '../../query/operations/contracts.js'
import type { UpdateExpression } from '../../query/updates/contracts.js'
import { normalizeUpdateExpression } from '../../query/updates/normalize.js'
import { Pointer } from '../../schema/relations/pointer.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import type {
	NestedWriteGraph,
	NestedWriteObjectNode,
	NestedWriteRelationshipNode,
} from '../../schema/nested-writes/contracts.js'
import { normalizeNestedWriteGraph } from '../../schema/nested-writes/normalization.js'
import type { NestedWriteRootOperationMarker } from '../../schema/nested-writes/operation-markers.js'
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
		...(node.command === 'create' ? { reservedId: reserveId() } : {}),
	})
}

/** Reserves every create identity before the first nested Runtime effect. */
export const prepareRuntimeNestedWriteGraph = (
	operation:
		| CreateOneOperationAst<SchemaDefinition>
		| UpdateOneOperationAst<SchemaDefinition>,
	marker: NestedWriteRootOperationMarker,
	binding: RuntimeNestedWriteBinding,
): NestedWriteGraph => {
	const schema =
		operation.kind === 'create-one'
			? operation.schema.definition
			: operation.query.schema.definition
	let normalized: NestedWriteGraph
	try {
		normalized = normalizeNestedWriteGraph(
			binding.schemas,
			schema,
			marker.command,
			marker.input,
			binding.limits,
		)
	} catch (error: unknown) {
		if (!(error instanceof TypeError)) throw error
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'Nested-write input normalization failed.',
			{
				cause: error,
				internalDetails: { message: error.message },
				publicMessage: 'The operation input is invalid.',
			},
		)
	}

	return immutableRecord({
		...normalized,
		root: prepareObjectNode(normalized.root, binding.reserveId),
	})
}

const createEmptyUpdateExpression = (): UpdateExpression<SchemaDefinition> =>
	immutableRecord({
		kind: 'update-expression' as const,
		operations: immutableArray([]),
	})

/** Converts one update node into the scalar and pointer work owned by its row. */
export const createRuntimeNestedUpdateExpression = (
	node: NestedWriteObjectNode,
	current?: Readonly<Record<string, unknown>>,
	base?: UpdateExpression<SchemaDefinition>,
): UpdateExpression<SchemaDefinition> => {
	if (node.command !== 'update') {
		throw new TypeError(
			'Nested-write update expression requires an update node',
		)
	}

	const scalar =
		base ??
		(Object.keys(node.data).length === 0
			? createEmptyUpdateExpression()
			: normalizeUpdateExpression(node.schema, node.data))
	const pointerFields = new Set(
		node.relationships
			.filter((relationship) => relationship.kind === 'pointer')
			.map((relationship) => relationship.fieldName),
	)
	const operations = scalar.operations.filter(
		(operation) => !pointerFields.has(operation.field),
	)

	for (const relationship of node.relationships) {
		if (relationship.kind !== 'pointer') continue

		let value: unknown
		if (relationship.command === 'connect' && relationship.id !== undefined) {
			value = new Pointer(relationship.target, relationship.id)
		} else if (
			relationship.command === 'create' &&
			relationship.child?.reservedId !== undefined
		) {
			value = new Pointer(relationship.target, relationship.child.reservedId)
		} else if (relationship.command === 'disconnect') {
			value = null
		} else if (relationship.command === 'update' && current !== undefined) {
			value = current[relationship.fieldName]
			if (!Pointer.is(value) || value.schema !== relationship.target) {
				throw new TypeError(
					`Nested pointer update target is not available: ${node.schema.className}.${relationship.fieldName}`,
				)
			}
		} else if (relationship.command === 'update') {
			continue
		} else {
			throw new TypeError(
				`Nested update contains unsupported pointer command: ${relationship.command}`,
			)
		}

		operations.push(
			immutableRecord({
				field: relationship.fieldName,
				kind: 'set' as const,
				value,
			}),
		)
	}

	const fieldOrder = new Map(
		Object.keys(node.schema.fields).map((fieldName, index) => [
			fieldName,
			index,
		]),
	)
	operations.sort(
		(left, right) =>
			(fieldOrder.get(left.field) ?? Number.MAX_SAFE_INTEGER) -
			(fieldOrder.get(right.field) ?? Number.MAX_SAFE_INTEGER),
	)

	return immutableRecord({
		kind: 'update-expression' as const,
		operations: immutableArray(operations),
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

/** Creates one root or child update while retaining its exact query envelope. */
export const createRuntimeNestedUpdateOperation = (
	operation: UpdateOneOperationAst<SchemaDefinition>,
	node: NestedWriteObjectNode,
	current?: Readonly<Record<string, unknown>>,
): UpdateOneOperationAst<SchemaDefinition> => {
	if (node.command !== 'update') {
		throw new TypeError('Nested-write child must be an update node')
	}

	return immutableRecord({
		...operation,
		query: immutableRecord({
			...operation.query,
			schema: createQueryAst(node.schema).schema,
		}),
		update: createRuntimeNestedUpdateExpression(
			node,
			current,
			current === undefined ? undefined : operation.update,
		),
	})
}
