import { immutableRecord } from '@ultimabase/shared'

import type {
	DatabaseConstraintNode,
	DatabaseRelationPredicateScope,
	DatabaseRelationReference,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import type { EnforcementState } from '../enforcement/state.js'
import type { RuntimeRelationFilterResolver } from '../relation-filters/execution.js'
import type { RuntimeInclusionTargetOperation } from '../relations/inclusion.js'
import type { RequestContext } from '../context/request-context.js'
import type { RuntimePipelineStages } from './contracts.js'
import { combineDatabaseRowFilters } from './private-execution.js'
import {
	createRuntimeEnforcementInput,
	createRuntimeOperationInput,
	emptyRuntimeConstraints,
	snapshotRuntimeConstraints,
} from './stage-inputs.js'

/** Retains every target restriction prepared for one eager inclusion branch. */
export interface RuntimeInclusionEnforcementResult {
	readonly constraints: readonly DatabaseConstraintNode[]
	readonly enforcement: EnforcementState | undefined
	readonly operation: RuntimeInclusionTargetOperation
	readonly relationPredicates:
		readonly DatabaseRelationPredicateScope[] | undefined
	readonly rowFilter: DatabaseRowFilterNode | undefined
}

/** Applies target policy before resolving one application-owned relation filter. */
export const prepareRuntimeInclusionEnforcement = async (
	stages: Readonly<RuntimePipelineStages>,
	context: RequestContext,
	initialOperation: RuntimeInclusionTargetOperation,
	relation: DatabaseRelationReference | undefined,
	relationFilterResolver: RuntimeRelationFilterResolver | undefined,
): Promise<RuntimeInclusionEnforcementResult> => {
	if (stages.enforcement === undefined) {
		const rowFilter =
			relation === undefined
				? undefined
				: await relationFilterResolver?.resolve(
						context,
						initialOperation,
						relation,
					)

		const relationPredicates = await relationFilterResolver?.preparePredicates({
			context,
			operation: initialOperation,
			rowFilter,
		})

		return immutableRecord({
			constraints: emptyRuntimeConstraints,
			enforcement: undefined,
			operation: initialOperation,
			relationPredicates,
			rowFilter,
		})
	}

	const enforcement = await stages.enforcement.evaluate(
		createRuntimeOperationInput(context, initialOperation),
	)
	const enforced = await stages.enforcement.enforceOperation(
		createRuntimeEnforcementInput(context, initialOperation, enforcement),
	)
	const operation = enforced.operation
	const relationFilter =
		relation === undefined
			? undefined
			: await relationFilterResolver?.resolve(context, operation, relation)

	const rowFilter = combineDatabaseRowFilters(
		relationFilter,
		enforced.rowFilter,
	)
	const relationPredicates =
		(await relationFilterResolver?.preparePredicates({
			context,
			operation,
			relationPredicates: enforced.relationPredicates,
			rowFilter,
		})) ?? enforced.relationPredicates

	return immutableRecord({
		constraints: snapshotRuntimeConstraints(enforced.constraints),
		enforcement,
		operation,
		relationPredicates,
		rowFilter,
	})
}
