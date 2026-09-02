import { immutableRecord } from '@ultimabase/shared'

import type {
	FrameworkApplication,
	PluginDefinition,
} from '../../foundation.js'
import { readApplicationCapabilityContributions } from '../../plugins/application-capability-access.js'
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

/** Composes only installed behavior providers in deterministic graph order. */
export const composeRuntimeBehaviors = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): RuntimeBehaviorStages | undefined => {
	const behaviors = readApplicationCapabilityContributions(
		application,
		runtimeBehaviorCapability,
	).map(({ owner, value }) =>
		attributeRuntimeBehavior(application, owner, value),
	)
	const contributionBehavior = composeRuntimeContributionBehavior(application)

	if (behaviors.length === 0 && contributionBehavior === undefined)
		return undefined

	const inputTransforms = behaviors.flatMap(({ transformInput }) =>
		transformInput === undefined ? [] : [transformInput],
	)
	const preparedInputTransforms = behaviors.flatMap(
		({ transformPreparedInput }) =>
			transformPreparedInput === undefined ? [] : [transformPreparedInput],
	)
	const preparedOperationTransforms = behaviors.flatMap(
		({ transformPreparedOperation }) =>
			transformPreparedOperation === undefined
				? []
				: [transformPreparedOperation],
	)
	if (contributionBehavior?.transformPreparedOperation !== undefined) {
		preparedOperationTransforms.push(
			contributionBehavior.transformPreparedOperation,
		)
	}
	const beforeObservers = behaviors.flatMap(({ beforeOperation }) =>
		beforeOperation === undefined ? [] : [beforeOperation],
	)
	const mutationInputGuards = behaviors.flatMap(({ guardMutationInput }) =>
		guardMutationInput === undefined ? [] : [guardMutationInput],
	)
	if (contributionBehavior?.beforeOperation !== undefined) {
		beforeObservers.unshift(contributionBehavior.beforeOperation)
	}
	const preparedObservers = behaviors.flatMap(({ observePreparedMutation }) =>
		observePreparedMutation === undefined ? [] : [observePreparedMutation],
	)
	const outcomeTransforms = behaviors.flatMap(({ transformMutationOutcome }) =>
		transformMutationOutcome === undefined ? [] : [transformMutationOutcome],
	)
	const databaseResultTransforms = behaviors.flatMap(
		({ transformDatabaseResult }) =>
			transformDatabaseResult === undefined ? [] : [transformDatabaseResult],
	)
	const resultTransforms = behaviors.flatMap(({ transformResult }) =>
		transformResult === undefined ? [] : [transformResult],
	)
	if (contributionBehavior?.transformResult !== undefined) {
		resultTransforms.push(contributionBehavior.transformResult)
	}
	const postCommitObservers = behaviors.flatMap(({ postCommit }) =>
		postCommit === undefined ? [] : [postCommit],
	)
	if (contributionBehavior?.postCommit !== undefined) {
		postCommitObservers.unshift(contributionBehavior.postCommit)
	}
	const preparationPredicates = behaviors.flatMap(
		({ requiresPreparedMutationItems }) =>
			requiresPreparedMutationItems === undefined
				? []
				: [requiresPreparedMutationItems],
	)

	const transformInput: RuntimeOperationTransformStage = async (input) => {
		let operation = input.operation
		for (const transform of inputTransforms) {
			operation = await transform(
				immutableRecord({ context: input.context, operation }),
			)
		}
		return operation
	}
	const transformPreparedInput: RuntimePreparedMutationTransformStage = async (
		input,
	) => {
		let operation = input.operation
		for (const transform of preparedInputTransforms) {
			operation = await transform(
				immutableRecord({
					context: input.context,
					operation,
					target: input.target,
					...(input.targets === undefined ? {} : { targets: input.targets }),
				}),
			)
		}
		return operation
	}
	const transformPreparedOperation: RuntimePreparedMutationTransformStage =
		async (input) => {
			let operation = input.operation
			for (const transform of preparedOperationTransforms) {
				operation = await transform(
					immutableRecord({
						context: input.context,
						operation,
						target: input.target,
						...(input.targets === undefined ? {} : { targets: input.targets }),
					}),
				)
			}
			return operation
		}
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
					operation: input.operation,
					outcome,
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
