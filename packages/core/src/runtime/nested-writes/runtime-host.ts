import { createPointer } from '../../schema/relations/pointer.js'
import { immutableRecord } from '@ultimabase/shared'

import { createQueryAst } from '../../query/ast/factory.js'
import { emptyQuerySelection } from '../../query/clauses/selection.js'
import { createQueryValueFilter } from '../../query/filters/factory.js'
import type {
	CreateOneOperationAst,
	FindManyOperationAst,
	FindOneOperationAst,
} from '../../query/operations/contracts.js'
import type { Pointer } from '../../schema/relations/pointer.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import type {
	NestedWriteGraph,
	NestedWriteObjectNode,
	NestedWriteRelationNode,
} from '../../schema/nested-writes/contracts.js'
import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseOperationAst,
	DatabaseRelationScope,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import {
	createInversePointerUpdate,
	createRelationTargetLookup,
} from '../relations/relation-mutation.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import type { RuntimeNestedWriteBinding } from './binding.js'
import {
	createRuntimeNestedCreateInput,
	createRuntimeNestedUpdateOperation,
} from './preparation.js'
import { retainReservedCreateId } from './reserved-create.js'
import {
	createRuntimeNestedWriteStageContext,
	runWithRuntimeNestedWriteStageContext,
} from './execution-context.js'
import { executeNestedOwningRelationMutation } from './relation-membership.js'
import type {
	RuntimeNestedWriteCoordinator,
	RuntimeNestedWriteHost,
} from './execution.js'

export interface RuntimeNestedWriteOperationExecutor {
	execute(
		operation: DatabaseOperationAst,
		rowFilter?: DatabaseRowFilterNode,
		protectedPolicyDeniedAsMissing?: true,
		nested?: Readonly<{
			coordinator: RuntimeNestedWriteCoordinator
			node: NestedWriteObjectNode
		}>,
		relation?: DatabaseRelationScope,
		relationWhere?: false,
	): Promise<unknown>
}

const readLogicalRecord = (
	value: unknown,
	message: string,
): Readonly<Record<string, unknown>> => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(message)
	}
	return value as Readonly<Record<string, unknown>>
}

const createRelationScope = (
	relation: NestedWriteRelationNode,
	sourceId: string,
): DatabaseRelationScope =>
	immutableRecord({
		fieldPath: [relation.fieldName],
		source: relation.source,
		sourceObjectId: sourceId,
		target: relation.target,
	})

/** Binds graph coordination to one transaction pipeline and request context. */
export const createRuntimeNestedWriteHost = (
	binding: RuntimeNestedWriteBinding,
	context: RequestContext,
	graph: NestedWriteGraph,
	stages: Readonly<RuntimePipelineStages>,
	executor: RuntimeNestedWriteOperationExecutor,
	readCoordinator: () => RuntimeNestedWriteCoordinator,
): RuntimeNestedWriteHost => {
	/** Runs one graph object through the ordinary pipeline as the active node. */
	const executeNode = (
		node: NestedWriteObjectNode,
		operation: DatabaseOperationAst,
		rowFilter?: DatabaseRowFilterNode,
		denied?: true,
		relation?: DatabaseRelationScope,
	): Promise<unknown> =>
		runWithRuntimeNestedWriteStageContext(
			createRuntimeNestedWriteStageContext(graph, node),
			() =>
				executor.execute(
					operation,
					rowFilter,
					denied,
					{ coordinator: readCoordinator(), node },
					relation,
				),
		)
	/** Runs one auxiliary read or membership write outside any graph node. */
	const executeDetached = (
		operation: DatabaseOperationAst,
		rowFilter?: DatabaseRowFilterNode,
		denied?: true,
		relation?: DatabaseRelationScope,
		relationWhere?: false,
	): Promise<unknown> =>
		runWithRuntimeNestedWriteStageContext(undefined, () =>
			executor.execute(
				operation,
				rowFilter,
				denied,
				undefined,
				relation,
				relationWhere,
			),
		)
	const readMappedBy = (relation: NestedWriteRelationNode) => {
		const mapping = binding.schemas.schemaTargets.getRelation(relation.source, [
			relation.fieldName,
		])
		if (mapping?.target !== relation.target) {
			throw new TypeError('Nested relation mapping is unavailable')
		}
		return mapping.mappedBy
	}
	const readInversePointerField = (
		relation: NestedWriteRelationNode,
	): string | undefined => {
		const mappedBy = readMappedBy(relation)
		return mappedBy?.kind === 'pointer' ? mappedBy.fieldPath[0] : undefined
	}

	return {
		executeCreate: async (node, injected) => {
			if (node.reservedId === undefined) {
				throw new TypeError('Nested create is missing its reserved identity')
			}
			const operation: CreateOneOperationAst<SchemaDefinition> =
				retainReservedCreateId(
					immutableRecord({
						input: createRuntimeNestedCreateInput(node, injected),
						kind: 'create-one' as const,
						schema: createQueryAst(node.schema).schema,
						selection: emptyQuerySelection,
					}),
					node.reservedId,
				)
			await executeNode(node, operation)
		},
		executeUpdate: async (node, target) => {
			const operation = createRuntimeNestedUpdateOperation(
				immutableRecord({
					kind: 'update-one' as const,
					query: createQueryAst(node.schema),
					update: immutableRecord({
						kind: 'update-expression' as const,
						operations: [],
					}),
				}),
				node,
			)
			const rowFilter = createQueryValueFilter(
				node.schema,
				'equal',
				'id',
				target.id,
			) as DatabaseRowFilterNode
			await executeNode(
				node,
				operation,
				rowFilter,
				true,
				target.relation === undefined
					? undefined
					: createRelationScope(target.relation.node, target.relation.sourceId),
			)
		},
		isInversePointerRelation: (relation) =>
			readMappedBy(relation)?.kind === 'pointer',
		mutateRelation: async (relation, sourceId, action, targetIds) => {
			if (targetIds.length === 0) return
			const mappedFieldName = readInversePointerField(relation)
			if (mappedFieldName === undefined) {
				await runWithRuntimeNestedWriteStageContext(undefined, () =>
					executeNestedOwningRelationMutation(
						stages,
						context,
						relation,
						sourceId,
						action,
						targetIds,
					),
				)
				return
			}
			for (const id of targetIds) {
				const update = createInversePointerUpdate(
					createPointer(relation.target, id),
					mappedFieldName,
					createPointer(relation.source, sourceId),
					action,
				)
				await executeDetached(update.operation, update.rowFilter, true)
			}
		},
		readInversePointerField,
		readRelationTargets: async (relation, sourceId, targetIds, unlinking) => {
			const scope = createRelationScope(relation, sourceId)
			const relationWhere = unlinking === true ? false : undefined
			if (targetIds === undefined) {
				const operation: FindManyOperationAst<SchemaDefinition> =
					immutableRecord({
						kind: 'find-many' as const,
						query: createQueryAst(relation.target),
					})
				const result = await executeDetached(
					operation,
					undefined,
					undefined,
					scope,
					relationWhere,
				)
				if (!Array.isArray(result)) {
					throw new TypeError('Nested relation lookup must return a collection')
				}
				return result
					.map((value) =>
						readLogicalRecord(
							value,
							'Nested relation lookup must return logical records',
						),
					)
					.toSorted((left, right) =>
						String(left.id).localeCompare(String(right.id)),
					)
			}

			const records: Readonly<Record<string, unknown>>[] = []
			for (const id of targetIds) {
				const operation: FindOneOperationAst<SchemaDefinition> =
					immutableRecord({
						kind: 'find-one' as const,
						query: createQueryAst(relation.target),
					})
				const rowFilter = createQueryValueFilter(
					relation.target,
					'equal',
					'id',
					id,
				) as DatabaseRowFilterNode
				const result = await executeDetached(
					operation,
					rowFilter,
					true,
					scope,
					relationWhere,
				)
				if (result === null) throw createProtectedObjectNotFoundError()
				records.push(
					readLogicalRecord(
						result,
						'Nested relation lookup must return one logical record',
					),
				)
			}
			return records
		},
		verifyTarget: async (pointer: Pointer) => {
			if (binding.schemas.get(pointer.schema.className) !== pointer.schema) {
				throw new TypeError(
					'Nested connect target belongs to another application',
				)
			}
			const lookup = createRelationTargetLookup(pointer)
			const result = await executeDetached(
				lookup.operation,
				lookup.rowFilter,
				true,
			)
			if (result === null) {
				throw createProtectedObjectNotFoundError()
			}
			return readLogicalRecord(
				result,
				'Nested connect target lookup must return one logical record',
			)
		},
	}
}
