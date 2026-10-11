import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import {
	formatPluginIdentity,
	type PluginIdentity,
} from '../../plugins/manifest.js'
import { runPostCommitEffect } from '../../errors/post-commit-errors.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { runtimeBehaviorCapability } from '../capabilities.js'
import { composeRuntimeContributionBehavior } from '../contributions/composition.js'
import type { RuntimeNestedWriteStageContext } from '../nested-writes/execution-context.js'
import type {
	RuntimeBehaviorStages,
	RuntimeMutationValidationIssue,
	RuntimePreparedMutationTransformStage,
} from '../pipeline/contracts.js'

type OwnerScope = <TResult>(callback: () => TResult) => TResult

/** Pairs one installed stage with the scope restoring its exact provider owner. */
interface BehaviorProvider<TStage> {
	readonly owner?: PluginIdentity
	readonly run: OwnerScope
	readonly stage: TStage
}

// Interceptors attribute every handler through the callback executor themselves.
const unattributed: OwnerScope = (callback) => callback()

const nestedWriteOf = (
	input: Readonly<{ nestedWrite?: RuntimeNestedWriteStageContext }>,
): Readonly<{ nestedWrite?: RuntimeNestedWriteStageContext }> =>
	input.nestedWrite === undefined ? {} : { nestedWrite: input.nestedWrite }

const selectedFieldsOverrideOf = (
	input: Readonly<{ selectedFieldsOverride?: readonly string[] }>,
): Readonly<{ selectedFieldsOverride?: readonly string[] }> =>
	input.selectedFieldsOverride === undefined
		? {}
		: { selectedFieldsOverride: input.selectedFieldsOverride }

/** Preserves the current operation and target context across ordered transforms. */
const composePrepared =
	(
		providers: readonly BehaviorProvider<RuntimePreparedMutationTransformStage>[],
	): RuntimePreparedMutationTransformStage =>
	async (input) => {
		let operation = input.operation
		for (const { run, stage } of providers) {
			operation = await run(() =>
				stage(
					immutableRecord({
						context: input.context,
						...nestedWriteOf(input),
						operation,
						target: input.target,
						...(input.targets === undefined ? {} : { targets: input.targets }),
					}),
				),
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
	const ownerScope =
		(owner: PluginIdentity): OwnerScope =>
		(callback) =>
			runWithApplicationPluginOwner(application, owner, callback)
	const behaviors = readApplicationKernelState(application)
		.capabilityContributions(runtimeBehaviorCapability)
		.map(({ owner, value }) => ({ owner, run: ownerScope(owner), value }))
	const interceptors = composeRuntimeContributionBehavior(application)

	if (behaviors.length === 0 && interceptors === undefined) return undefined

	/** Lists providers of one stage; prepared-operation interceptors run after plugin behavior. */
	const collect = <const TKey extends keyof RuntimeBehaviorStages>(
		key: TKey,
		includeInterceptors = false,
	): readonly BehaviorProvider<NonNullable<RuntimeBehaviorStages[TKey]>>[] => {
		const providers = behaviors.flatMap(({ owner, run, value }) => {
			const stage = value[key]
			return stage === undefined ? [] : [{ owner, run, stage }]
		})
		const interceptor = includeInterceptors ? interceptors?.[key] : undefined
		return interceptor === undefined
			? providers
			: [...providers, { run: unattributed, stage: interceptor }]
	}

	const inputTransforms = collect('transformInput')
	const preparedInputTransforms = collect('transformPreparedInput')
	const preparedOperationTransforms = collect(
		'transformPreparedOperation',
		true,
	)
	const beforeObservers = collect('beforeOperation')
	const mutationValidators = collect('validateMutationInput')
	const mutationInputGuards = collect('guardMutationInput')
	const preparedObservers = collect('observePreparedMutation')
	const outcomeTransforms = collect('transformMutationOutcome')
	const databaseResultTransforms = collect('transformDatabaseResult')
	const resultTransforms = collect('transformResult')
	const postCommitObservers = collect('postCommit')
	const preparationPredicates = collect('requiresPreparedMutationItems')

	// Each transform receives a fresh immutable envelope with exactly the reference
	// keys and the latest value; an absent capability contributes no neutral stage.
	const composed: {
		-readonly [
			TKey in keyof RuntimeBehaviorStages
		]?: RuntimeBehaviorStages[TKey]
	} = {}
	if (inputTransforms.length > 0) {
		composed.transformInput = async (input) => {
			let operation = input.operation
			for (const { run, stage } of inputTransforms) {
				operation = await run(() =>
					stage(
						immutableRecord({
							context: input.context,
							...nestedWriteOf(input),
							operation,
						}),
					),
				)
			}
			return operation
		}
	}
	if (preparedInputTransforms.length > 0) {
		composed.transformPreparedInput = composePrepared(preparedInputTransforms)
	}
	if (preparedOperationTransforms.length > 0) {
		composed.transformPreparedOperation = composePrepared(
			preparedOperationTransforms,
		)
	}
	if (beforeObservers.length > 0) {
		composed.beforeOperation = async (input) => {
			for (const { run, stage } of beforeObservers)
				await run(() => stage(input))
		}
	}
	if (mutationValidators.length > 0) {
		composed.validateMutationInput = async (input) => {
			let { operation } = input
			const issues: RuntimeMutationValidationIssue[] = []
			for (const { run, stage } of mutationValidators) {
				const result = await run(() =>
					stage(
						immutableRecord({
							context: input.context,
							...nestedWriteOf(input),
							operation,
							structuralIssues: input.structuralIssues,
							target: input.target,
							...(input.targets === undefined
								? {}
								: { targets: input.targets }),
						}),
					),
				)
				issues.push(...result.issues)
				operation = result.operation
			}
			return immutableRecord({ issues: immutableArray(issues), operation })
		}
	}
	if (mutationInputGuards.length > 0) {
		composed.guardMutationInput = async (input) => {
			for (const { run, stage } of mutationInputGuards)
				await run(() => stage(input))
		}
	}
	if (preparedObservers.length > 0) {
		composed.observePreparedMutation = async (input) => {
			for (const { run, stage } of preparedObservers)
				await run(() => stage(input))
		}
	}
	if (outcomeTransforms.length > 0) {
		composed.transformMutationOutcome = async (input) => {
			let outcome = input.outcome
			for (const { run, stage } of outcomeTransforms) {
				outcome = await run(() =>
					stage(
						immutableRecord({
							context: input.context,
							...nestedWriteOf(input),
							operation: input.operation,
							outcome,
							...selectedFieldsOverrideOf(input),
						}),
					),
				)
			}
			return outcome
		}
	}
	if (databaseResultTransforms.length > 0) {
		composed.transformDatabaseResult = async (input) => {
			let result = input.result
			for (const { run, stage } of databaseResultTransforms) {
				result = await run(() =>
					stage(
						immutableRecord({
							context: input.context,
							...nestedWriteOf(input),
							operation: input.operation,
							result,
							...selectedFieldsOverrideOf(input),
						}),
					),
				)
			}
			return result
		}
	}
	if (resultTransforms.length > 0) {
		composed.transformResult = async (input) => {
			let result = input.result
			for (const { run, stage } of resultTransforms) {
				result = await run(() =>
					stage(
						immutableRecord({
							context: input.context,
							...nestedWriteOf(input),
							operation: input.operation,
							result,
							...(input.outcome === undefined
								? {}
								: { outcome: input.outcome }),
							...selectedFieldsOverrideOf(input),
						}),
					),
				)
			}
			return result
		}
	}
	if (postCommitObservers.length > 0) {
		// One failing provider is logged and never stops the next (ADR-0318).
		composed.postCommit = async (input) => {
			for (const { owner, run, stage } of postCommitObservers) {
				await runPostCommitEffect(() => run(() => stage(input)), {
					requestId: input.context.requestId,
					source: `the postCommit stage of ${owner === undefined ? 'a Runtime interceptor' : formatPluginIdentity(owner)}`,
				})
			}
		}
	}
	if (preparationPredicates.length > 0) {
		composed.requiresPreparedMutationItems = (operation) =>
			preparationPredicates.some(({ run, stage }) =>
				run(() => stage(operation)),
			)
	}

	return immutableRecord(composed)
}
