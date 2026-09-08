import { immutableRecord } from '@ultimabase/shared'

import { createQueryAst } from '../../query/ast/factory.js'
import { emptyQuerySelection } from '../../query/clauses/selection.js'
import type { CreateOneOperationAst } from '../../query/operations/contracts.js'
import { Pointer } from '../../schema/relations/pointer.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import type {
	NestedWriteGraph,
	NestedWriteObjectNode,
} from '../../schema/nested-writes/contracts.js'
import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseOperationAst,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import {
	createInversePointerUpdate,
	createRelationTargetLookup,
} from '../relations/relation-mutation.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import type { RuntimeNestedWriteBinding } from './binding.js'
import { createRuntimeNestedCreateInput } from './preparation.js'
import { retainReservedCreateId } from './reserved-create.js'
import {
	createRuntimeNestedWriteStageContext,
	runWithRuntimeNestedWriteStageContext,
} from './execution-context.js'
import { executeNestedOwningRelationConnect } from './relation-membership.js'
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
			graph: NestedWriteGraph
			node: NestedWriteObjectNode
		}>,
	): Promise<unknown>
}

/** Binds graph coordination to one transaction pipeline and request context. */
export const createRuntimeNestedWriteHost = (
	binding: RuntimeNestedWriteBinding,
	context: RequestContext,
	graph: NestedWriteGraph,
	stages: Readonly<RuntimePipelineStages>,
	executor: RuntimeNestedWriteOperationExecutor,
	readCoordinator: () => RuntimeNestedWriteCoordinator,
): RuntimeNestedWriteHost => ({
	connectRelation: async (relation, sourceId, targetIds) => {
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
					'connect',
				)
				await runWithRuntimeNestedWriteStageContext(undefined, () =>
					executor.execute(update.operation, update.rowFilter, true),
				)
			}
			return
		}

		await runWithRuntimeNestedWriteStageContext(undefined, () =>
			executeNestedOwningRelationConnect(
				stages,
				context,
				relation,
				sourceId,
				targetIds,
			),
		)
	},
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
	},
})
