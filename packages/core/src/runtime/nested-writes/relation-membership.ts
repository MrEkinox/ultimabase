import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { createQueryAst } from '../../query/ast/factory.js'
import { createQueryValueFilter } from '../../query/filters/factory.js'
import { Pointer } from '../../schema/relations/pointer.js'
import type { NestedWriteRelationNode } from '../../schema/nested-writes/contracts.js'
import type { RequestContext } from '../context/request-context.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import { emptyRuntimeConstraints } from '../pipeline/stage-inputs.js'
import { executeRuntimeDatabaseOperation } from '../pipeline/database-execution.js'

/** Applies an owning membership delta without starting a second source lifecycle. */
export const executeNestedOwningRelationMutation = async (
	stages: Readonly<RuntimePipelineStages>,
	context: RequestContext,
	relation: NestedWriteRelationNode,
	sourceId: string,
	action: 'connect' | 'disconnect',
	targetIds: readonly string[],
): Promise<void> => {
	if (targetIds.length === 0) return

	const targets = immutableArray(
		targetIds.map((id) => new Pointer(relation.target, id)),
	)
	const update = immutableRecord({
		kind: 'update-expression' as const,
		operations: immutableArray([
			immutableRecord({
				field: relation.fieldName,
				kind: 'relation' as const,
				value: immutableRecord({
					action,
					targets,
				}),
			}),
		]),
	})
	const query = createQueryAst(relation.source)
	const operation = immutableRecord({
		kind: 'update-one' as const,
		query,
		update,
	})
	const rowFilter = createQueryValueFilter(
		relation.source,
		'equal',
		'id',
		sourceId,
	)

	await executeRuntimeDatabaseOperation(
		stages.databaseOperation,
		context,
		undefined,
		stages.persistencePlanRewrite,
		immutableRecord({
			constraints: emptyRuntimeConstraints,
			operation,
			relation: immutableRecord({
				fieldPath: immutableArray([relation.fieldName]),
				source: relation.source,
				sourceObjectId: sourceId,
				target: relation.target,
			}),
			rowFilter,
			strictTarget: true as const,
		}),
		stages.finalMutationValidation,
		undefined,
		undefined,
	)
}
