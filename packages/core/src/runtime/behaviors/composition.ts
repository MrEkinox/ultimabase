import { immutableRecord } from '@ultimabase/shared'

import type { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginDefinition } from '../../foundation.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import type { PluginIdentity } from '../../plugins/manifest.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { runtimeBehaviorCapability } from '../capabilities.js'
import { composeRuntimeContributionBehavior } from '../contributions/composition.js'
import type {
	RuntimeBehaviorStages,
	RuntimeFinalMutationGuardStage,
	RuntimeMutationOutcomeTransformStage,
	RuntimeProjectedDatabaseResultTransformStage,
	RuntimeMaterializedResultTransformStage,
	RuntimeOperationGuardStage,
	RuntimeOperationTransformStage,
	RuntimePreparedMutationEffectStage,
	RuntimePreparedMutationTransformStage,
	RuntimeResultEffectStage,
} from '../pipeline/contracts.js'

/** Wraps one behavior once so every stage restores its exact provider owner. */
const attributeRuntimeBehavior = (
	application: object,
	owner: PluginIdentity,
	behavior: RuntimeBehaviorStages,
): RuntimeBehaviorStages => {
	const run = <TResult>(callback: () => TResult): TResult =>
		runWithApplicationPluginOwner(application, owner, callback)
	const beforeOperation = behavior.beforeOperation
	const guardMutationInput = behavior.guardMutationInput
	const observePreparedMutation = behavior.observePreparedMutation
	const postCommit = behavior.postCommit
	const requiresPreparedMutationItems = behavior.requiresPreparedMutationItems
	const transformDatabaseResult = behavior.transformDatabaseResult
	const transformInput = behavior.transformInput
	const transformMutationOutcome = behavior.transformMutationOutcome
	const transformPreparedInput = behavior.transformPreparedInput
	const transformPreparedOperation = behavior.transformPreparedOperation
	const transformResult = behavior.transformResult

	return immutableRecord({
		...(beforeOperation === undefined
			? {}
			: { beforeOperation: (input) => run(() => beforeOperation(input)) }),
		...(guardMutationInput === undefined
			? {}
			: {
					guardMutationInput: (input) => run(() => guardMutationInput(input)),
				}),
		...(observePreparedMutation === undefined
			? {}
			: {
					observePreparedMutation: (input) =>
						run(() => observePreparedMutation(input)),
				}),
		...(postCommit === undefined
			? {}
			: { postCommit: (input) => run(() => postCommit(input)) }),
		...(requiresPreparedMutationItems === undefined
			? {}
			: {
					requiresPreparedMutationItems: (operation) =>
						run(() => requiresPreparedMutationItems(operation)),
				}),
		...(transformDatabaseResult === undefined
			? {}
			: {
					transformDatabaseResult: (input) =>
						run(() => transformDatabaseResult(input)),
				}),
		...(transformInput === undefined
			? {}
			: { transformInput: (input) => run(() => transformInput(input)) }),
		...(transformMutationOutcome === undefined
			? {}
			: {
					transformMutationOutcome: (input) =>
						run(() => transformMutationOutcome(input)),
				}),
		...(transformPreparedInput === undefined
			? {}
			: {
					transformPreparedInput: (input) =>
						run(() => transformPreparedInput(input)),
				}),
		...(transformPreparedOperation === undefined
			? {}
			: {
					transformPreparedOperation: (input) =>
						run(() => transformPreparedOperation(input)),
				}),
		...(transformResult === undefined
			? {}
			: { transformResult: (input) => run(() => transformResult(input)) }),
	})
}

/** Preserves the current operation and target context across ordered transforms. */
const composePreparedMutationTransforms =
	(
		transforms: readonly RuntimePreparedMutationTransformStage[],
	): RuntimePreparedMutationTransformStage =>
	async (input) => {
		let operation = input.operation
		for (const transform of transforms) {
			operation = await transform(
				immutableRecord({
					context: input.context,
					...(input.nestedWrite === undefined
						? {}
						: { nestedWrite: input.nestedWrite }),
					operation,
					target: input.target,
					...(input.targets === undefined ? {} : { targets: input.targets }),
				}),
			)
		}
		return operation
	}

/** Composes only installed behavior providers in deterministic graph order. */
export const composeRuntimeBehaviors = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): RuntimeBehaviorStages | undefined => {
	const behaviorContributions = readApplicationKernelState(
		application,
	).capabilityContributions(runtimeBehaviorCapability)
	const contributionBehavior = composeRuntimeContributionBehavior(application)

	if (behaviorContributions.length === 0 && contributionBehavior === undefined)
		return undefined

	const inputTransforms: RuntimeOperationTransformStage[] = [],
		preparedInputTransforms: RuntimePreparedMutationTransformStage[] = [],
		preparedOperationTransforms: RuntimePreparedMutationTransformStage[] = [],
		beforeObservers: RuntimeOperationGuardStage[] = [],
		mutationInputGuards: RuntimeFinalMutationGuardStage[] = [],
		preparedObservers: RuntimePreparedMutationEffectStage[] = [],
		outcomeTransforms: RuntimeMutationOutcomeTransformStage[] = [],
		databaseResultTransforms: RuntimeProjectedDatabaseResultTransformStage[] =
			[],
		resultTransforms: RuntimeMaterializedResultTransformStage[] = [],
		postCommitObservers: RuntimeResultEffectStage[] = [],
		preparationPredicates: NonNullable<
			RuntimeBehaviorStages['requiresPreparedMutationItems']
		>[] = []

	for (const { owner, value } of behaviorContributions) {
		const behavior = attributeRuntimeBehavior(application, owner, value)
		if (behavior.transformInput !== undefined)
			inputTransforms.push(behavior.transformInput)
		if (behavior.transformPreparedInput !== undefined)
			preparedInputTransforms.push(behavior.transformPreparedInput)
		if (behavior.transformPreparedOperation !== undefined)
			preparedOperationTransforms.push(behavior.transformPreparedOperation)
		if (behavior.beforeOperation !== undefined)
			beforeObservers.push(behavior.beforeOperation)
		if (behavior.guardMutationInput !== undefined)
			mutationInputGuards.push(behavior.guardMutationInput)
		if (behavior.observePreparedMutation !== undefined)
			preparedObservers.push(behavior.observePreparedMutation)
		if (behavior.transformMutationOutcome !== undefined)
			outcomeTransforms.push(behavior.transformMutationOutcome)
		if (behavior.transformDatabaseResult !== undefined)
			databaseResultTransforms.push(behavior.transformDatabaseResult)
		if (behavior.transformResult !== undefined)
			resultTransforms.push(behavior.transformResult)
		if (behavior.postCommit !== undefined)
			postCommitObservers.push(behavior.postCommit)
		if (behavior.requiresPreparedMutationItems !== undefined)
			preparationPredicates.push(behavior.requiresPreparedMutationItems)
	}

	if (contributionBehavior?.transformPreparedOperation !== undefined) {
		preparedOperationTransforms.push(
			contributionBehavior.transformPreparedOperation,
		)
	}
	if (contributionBehavior?.beforeOperation !== undefined) {
		beforeObservers.unshift(contributionBehavior.beforeOperation)
	}
	if (contributionBehavior?.transformResult !== undefined) {
		resultTransforms.push(contributionBehavior.transformResult)
	}

	const transformInput: RuntimeOperationTransformStage = async (input) => {
		let operation = input.operation
		for (const transform of inputTransforms) {
			operation = await transform(
				immutableRecord({
					context: input.context,
					...(input.nestedWrite === undefined
						? {}
						: { nestedWrite: input.nestedWrite }),
					operation,
				}),
			)
		}
		return operation
	}
	const transformPreparedInput = composePreparedMutationTransforms(
		preparedInputTransforms,
	)
	const transformPreparedOperation = composePreparedMutationTransforms(
		preparedOperationTransforms,
	)
	const beforeOperation: RuntimeOperationGuardStage = async (input) => {
		for (const observe of beforeObservers) await observe(input)
	}
	const guardMutationInput: RuntimeFinalMutationGuardStage = async (input) => {
		for (const guard of mutationInputGuards) await guard(input)
	}
	const observePreparedMutation: RuntimePreparedMutationEffectStage = async (
		input,
	) => {
		for (const observe of preparedObservers) await observe(input)
	}
	const transformMutationOutcome: RuntimeMutationOutcomeTransformStage = async (
		input,
	) => {
		let outcome = input.outcome
		for (const transform of outcomeTransforms) {
			outcome = await transform(
				immutableRecord({
					context: input.context,
					...(input.nestedWrite === undefined
						? {}
						: { nestedWrite: input.nestedWrite }),
					operation: input.operation,
					outcome,
					...(input.selectedFieldsOverride === undefined
						? {}
						: { selectedFieldsOverride: input.selectedFieldsOverride }),
				}),
			)
		}
		return outcome
	}
	const transformDatabaseResult: RuntimeProjectedDatabaseResultTransformStage =
		async (input) => {
			let result = input.result
			for (const transform of databaseResultTransforms) {
				result = await transform(
					immutableRecord({
						context: input.context,
						...(input.nestedWrite === undefined
							? {}
							: { nestedWrite: input.nestedWrite }),
						operation: input.operation,
						result,
						...(input.selectedFieldsOverride === undefined
							? {}
							: { selectedFieldsOverride: input.selectedFieldsOverride }),
					}),
				)
			}
			return result
		}
	const transformResult: RuntimeMaterializedResultTransformStage = async (
		input,
	) => {
		let result = input.result
		for (const transform of resultTransforms) {
			result = await transform(
				immutableRecord({
					context: input.context,
					...(input.nestedWrite === undefined
						? {}
						: { nestedWrite: input.nestedWrite }),
					operation: input.operation,
					result,
					...(input.outcome === undefined ? {} : { outcome: input.outcome }),
					...(input.selectedFieldsOverride === undefined
						? {}
						: { selectedFieldsOverride: input.selectedFieldsOverride }),
				}),
			)
		}
		return result
	}
	const postCommit: RuntimeResultEffectStage = async (input) => {
		for (const observe of postCommitObservers) await observe(input)
	}

	return immutableRecord({
		...(inputTransforms.length === 0 ? {} : { transformInput }),
		...(preparedInputTransforms.length === 0 ? {} : { transformPreparedInput }),
		...(preparedOperationTransforms.length === 0
			? {}
			: { transformPreparedOperation }),
		...(beforeObservers.length === 0 ? {} : { beforeOperation }),
		...(mutationInputGuards.length === 0 ? {} : { guardMutationInput }),
		...(preparedObservers.length === 0 ? {} : { observePreparedMutation }),
		...(outcomeTransforms.length === 0 ? {} : { transformMutationOutcome }),
		...(databaseResultTransforms.length === 0
			? {}
			: { transformDatabaseResult }),
		...(resultTransforms.length === 0 ? {} : { transformResult }),
		...(postCommitObservers.length === 0 ? {} : { postCommit }),
		...(preparationPredicates.length === 0
			? {}
			: {
					requiresPreparedMutationItems: (operation) =>
						preparationPredicates.some((predicate) => predicate(operation)),
				}),
	})
}
