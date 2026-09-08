import { immutableRecord } from '@ultimabase/shared'

import { createQueryAst } from '../../query/ast/factory.js'
import { emptyQuerySelection } from '../../query/clauses/selection.js'
import { createQueryValueFilter } from '../../query/filters/factory.js'
import type {
	CreateOneOperationAst,
	FindManyOperationAst,
	FindOneOperationAst,
} from '../../query/operations/contracts.js'
import { Pointer } from '../../schema/relations/pointer.js'
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
	RuntimeNestedWriteUpdateTarget,
} from './execution.js'

export interface RuntimeNestedWriteOperationExecutor {
	execute(
		operation: DatabaseOperationAst,
		rowFilter?: DatabaseRowFilterNode,
		protectedPolicyDeniedAsMissing?: true,
		nested?: Readonly<{
			coordinator: RuntimeNestedWriteCoordinator
			graph: NestedWriteGraph
			node: NestedWriteObjectNode
		}>,
		relation?: DatabaseRelationScope,
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
): RuntimeNestedWriteHost => ({
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
		await runWithRuntimeNestedWriteStageContext(
			createRuntimeNestedWriteStageContext(graph, node),
			() =>
				executor.execute(operation, undefined, undefined, {
					coordinator: readCoordinator(),
					graph,
					node,
				}),
		)
	},
	executeUpdate: async (
		node: NestedWriteObjectNode,
		target: RuntimeNestedWriteUpdateTarget,
	) => {
		const query = createQueryAst(node.schema)
		const operation = createRuntimeNestedUpdateOperation(
			immutableRecord({
				kind: 'update-one' as const,
				query,
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
		const relation =
			target.relation === undefined
				? undefined
				: createRelationScope(target.relation.node, target.relation.sourceId)
		await runWithRuntimeNestedWriteStageContext(
			createRuntimeNestedWriteStageContext(graph, node),
			() =>
				executor.execute(
					operation,
					rowFilter,
					true,
					{
						coordinator: readCoordinator(),
						graph,
						node,
					},
					relation,
				),
		)
	},
	isInversePointerRelation: (relation) => {
		const mapping = binding.schemas.schemaTargets.getRelation(relation.source, [
			relation.fieldName,
		])
		if (mapping?.target !== relation.target) {
			throw new TypeError('Nested relation mapping is unavailable')
		}
		return mapping.mappedBy?.kind === 'pointer'
	},
	mutateRelation: async (relation, sourceId, action, targetIds) => {
		if (targetIds.length === 0) return
		const mapping = binding.schemas.schemaTargets.getRelation(relation.source, [
			relation.fieldName,
		])
		if (mapping?.target !== relation.target) {
			throw new TypeError('Nested relation mapping is unavailable')
		}

		const mappedFieldName =
			mapping.mappedBy?.kind === 'pointer'
				? mapping.mappedBy.fieldPath[0]
				: undefined
		if (mappedFieldName !== undefined) {
			for (const id of targetIds) {
				const update = createInversePointerUpdate(
					new Pointer(relation.target, id),
					mappedFieldName,
					new Pointer(relation.source, sourceId),
					action,
				)
				await runWithRuntimeNestedWriteStageContext(undefined, () =>
					executor.execute(update.operation, update.rowFilter, true),
				)
			}
			return
		}

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
	},
	readInversePointerField: (relation) => {
		const mapping = binding.schemas.schemaTargets.getRelation(relation.source, [
			relation.fieldName,
		])
		if (mapping?.target !== relation.target) {
			throw new TypeError('Nested relation mapping is unavailable')
		}
		return mapping.mappedBy?.kind === 'pointer'
			? mapping.mappedBy.fieldPath[0]
			: undefined
	},
	readRelationTargets: async (relation, sourceId, targetIds) => {
		const scope = createRelationScope(relation, sourceId)
		if (targetIds === undefined) {
			const operation: FindManyOperationAst<SchemaDefinition> = immutableRecord(
				{
					kind: 'find-many' as const,
					query: createQueryAst(relation.target),
				},
			)
			const result = await runWithRuntimeNestedWriteStageContext(
				undefined,
				() =>
					executor.execute(operation, undefined, undefined, undefined, scope),
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
			const operation: FindOneOperationAst<SchemaDefinition> = immutableRecord({
				kind: 'find-one' as const,
				query: createQueryAst(relation.target),
			})
			const rowFilter = createQueryValueFilter(
				relation.target,
				'equal',
				'id',
				id,
			) as DatabaseRowFilterNode
			const result = await runWithRuntimeNestedWriteStageContext(
				undefined,
				() => executor.execute(operation, rowFilter, true, undefined, scope),
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
		const result = await runWithRuntimeNestedWriteStageContext(undefined, () =>
			executor.execute(lookup.operation, lookup.rowFilter, true),
		)
		if (result === null) {
			throw createProtectedObjectNotFoundError()
		}
		return readLogicalRecord(
			result,
			'Nested connect target lookup must return one logical record',
		)
	},
})
