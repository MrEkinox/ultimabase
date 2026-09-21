import { immutableRecord } from '@ultimabase/shared'
import {
	createRuntimeBehaviorBoundaries,
	type DatabaseMutationOperationAst,
	type RuntimeBehaviorBoundaries,
	type RuntimeBehaviorStages,
	type RuntimePreparedMutationStageInput,
} from '@ultimabase/core'

import type { HookContributionPlan } from './contribution-plan.js'
import type { HookExecutionRuntime } from './execution-runtime.js'
import { resolveFieldInputs } from './input-resolution.js'
import {
	isSchemaMutationHookRequest,
	runSchemaMutationAfterHooks,
	runSchemaMutationBeforeHooks,
} from './schema-mutation-phases.js'
import {
	runSchemaPreparedPhases,
	runSchemaResultPhases,
	runSchemaResolveInput,
} from './schema-phases.js'

/** Runs schema input resolution only after the visible target is prepared and locked. */
const resolveSchemaInput = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	boundaries: RuntimeBehaviorBoundaries,
	plan: HookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimePreparedMutationStageInput<TOperation>,
): Promise<TOperation> => {
	if (
		input.operation.kind === 'delete-one' ||
		input.operation.kind === 'delete-many'
	) {
		return input.operation
	}
	if (input.operation.kind === 'update-one' && input.target === null) {
		return input.operation
	}

	return runSchemaResolveInput(boundaries, plan, runtime, input)
}

/** Compiles official declarations into Core's generic behavior boundaries. */
export const createHookBehavior = (
	plan: HookContributionPlan,
	runtime: HookExecutionRuntime,
): RuntimeBehaviorStages => {
	const boundaries = createRuntimeBehaviorBoundaries()
	return immutableRecord({
		beforeOperation: (input) =>
			isSchemaMutationHookRequest(input)
				? runSchemaMutationBeforeHooks(plan, runtime, input)
				: undefined,
		transformMutationOutcome: (input) =>
			isSchemaMutationHookRequest(input)
				? input.outcome
				: boundaries.snapshotMutationOutcome(
						input.operation,
						input.outcome,
						input.selectedFieldsOverride,
					),
		transformInput: (input) => resolveFieldInputs(plan, runtime, input),
		transformResult: (input) =>
			isSchemaMutationHookRequest(input)
				? runSchemaMutationAfterHooks(plan, runtime, input)
				: runSchemaResultPhases(boundaries, plan, runtime, input),
		observePreparedMutation: (input) =>
			isSchemaMutationHookRequest(input)
				? undefined
				: runSchemaPreparedPhases(plan, runtime, input),
		transformPreparedInput: (input) =>
			resolveSchemaInput(boundaries, plan, runtime, input),
	})
}
