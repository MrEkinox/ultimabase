import { immutableRecord } from '@ultimabase/shared'
import {
	createRuntimeBehaviorBoundaries,
	type DatabaseMutationLogicalRecord,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type RuntimeBehaviorBoundaries,
	type RuntimeBehaviorStages,
	type RuntimeLogicalMutationOperationAst,
	type RuntimeLogicalOperationAst,
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

const readNativeOperation = (
	operation: RuntimeLogicalOperationAst,
): DatabaseOperationAst => {
	if (operation.kind === 'plugin-schema-mutation') {
		throw new TypeError('Native Hooks require a database operation')
	}

	return operation
}

const readNativeMutationOperation = (
	operation: RuntimeLogicalMutationOperationAst,
): DatabaseMutationOperationAst => {
	if (operation.kind === 'plugin-schema-mutation') {
		throw new TypeError('Native Hooks require a database mutation')
	}

	return operation
}

/** Runs schema input resolution only after the visible target is prepared and locked. */
const resolveSchemaInput = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	boundaries: RuntimeBehaviorBoundaries,
	plan: HookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimePreparedMutationStageInput<
		TOperation,
		DatabaseMutationLogicalRecord<TOperation>
	>,
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
		transformMutationOutcome: (input) => {
			if (isSchemaMutationHookRequest(input)) return input.outcome
			boundaries.snapshotMutationOutcome(
				readNativeMutationOperation(input.operation),
				input.outcome,
				input.selectedFieldsOverride,
			)
			return boundaries.snapshotValue(input.outcome)
		},
		transformInput: (input) => resolveFieldInputs(plan, runtime, input),
		transformResult: (input) => {
			if (isSchemaMutationHookRequest(input)) {
				return runSchemaMutationAfterHooks(plan, runtime, input)
			}
			return runSchemaResultPhases(boundaries, plan, runtime, {
				...input,
				operation: readNativeOperation(input.operation),
			})
		},
		observePreparedMutation: (input) => {
			if (isSchemaMutationHookRequest(input)) return undefined
			return runSchemaPreparedPhases(plan, runtime, {
				...input,
				operation: readNativeMutationOperation(input.operation),
			})
		},
		transformPreparedInput: (input) =>
			resolveSchemaInput(boundaries, plan, runtime, input),
	})
}
