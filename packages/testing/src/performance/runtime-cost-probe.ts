import {
	definePlugin,
	replaceRuntime,
	RuntimePipeline,
	type PluginDefinition,
	type RuntimeBehaviorStages,
	type RuntimeEnforcementStages,
	type RuntimePipelineStages,
} from '@ultimabase/core'

/** Configures one application-local Runtime cost probe. */
export interface RuntimeCostProbeOptions {
	/** Distinguishes several probes configured in the same application graph. */
	readonly instanceId?: string
}

/** Records deterministic optional Runtime work independently from elapsed time. */
export interface RuntimeCostSnapshot {
	readonly startup: Readonly<{
		readonly runtimeAssemblies: number
		readonly behaviorBundles: number
		readonly behaviorStages: number
		readonly enforcementBundles: number
		readonly enforcementStages: number
	}>
	readonly requests: Readonly<{
		readonly behaviorStageCalls: number
		readonly enforcementStageCalls: number
	}>
}

interface MutableRuntimeCostCounters {
	runtimeAssemblies: number
	behaviorBundles: number
	behaviorStages: number
	enforcementBundles: number
	enforcementStages: number
	behaviorStageCalls: number
	enforcementStageCalls: number
}

const countStages = (stages: object): number =>
	Object.values(stages).filter((stage) => typeof stage === 'function').length

const wrapBehaviorStages = (
	stages: RuntimeBehaviorStages,
	onCall: () => void,
): RuntimeBehaviorStages => {
	const beforeOperation = stages.beforeOperation
	const observePreparedMutation = stages.observePreparedMutation
	const postCommit = stages.postCommit
	const requiresPreparedMutationItems = stages.requiresPreparedMutationItems
	const transformDatabaseResult = stages.transformDatabaseResult
	const transformInput = stages.transformInput
	const transformMutationOutcome = stages.transformMutationOutcome
	const transformPreparedInput = stages.transformPreparedInput
	const transformPreparedOperation = stages.transformPreparedOperation
	const transformResult = stages.transformResult

	return {
		...(beforeOperation === undefined
			? {}
			: {
					beforeOperation: (input) => {
						onCall()
						return beforeOperation(input)
					},
				}),
		...(observePreparedMutation === undefined
			? {}
			: {
					observePreparedMutation: (input) => {
						onCall()
						return observePreparedMutation(input)
					},
				}),
		...(postCommit === undefined
			? {}
			: {
					postCommit: (input) => {
						onCall()
						return postCommit(input)
					},
				}),
		...(requiresPreparedMutationItems === undefined
			? {}
			: {
					requiresPreparedMutationItems: (operation) => {
						onCall()
						return requiresPreparedMutationItems(operation)
					},
				}),
		...(transformDatabaseResult === undefined
			? {}
			: {
					transformDatabaseResult: (input) => {
						onCall()
						return transformDatabaseResult(input)
					},
				}),
		...(transformInput === undefined
			? {}
			: {
					transformInput: (input) => {
						onCall()
						return transformInput(input)
					},
				}),
		...(transformMutationOutcome === undefined
			? {}
			: {
					transformMutationOutcome: (input) => {
						onCall()
						return transformMutationOutcome(input)
					},
				}),
		...(transformPreparedInput === undefined
			? {}
			: {
					transformPreparedInput: (input) => {
						onCall()
						return transformPreparedInput(input)
					},
				}),
		...(transformPreparedOperation === undefined
			? {}
			: {
					transformPreparedOperation: (input) => {
						onCall()
						return transformPreparedOperation(input)
					},
				}),
		...(transformResult === undefined
			? {}
			: {
					transformResult: (input) => {
						onCall()
						return transformResult(input)
					},
				}),
	}
}

const wrapEnforcementStages = (
	stages: RuntimeEnforcementStages,
	onCall: () => void,
): RuntimeEnforcementStages => {
	const enforceMutationOutcome = stages.enforceMutationOutcome
	const enforceOperation = stages.enforceOperation
	const enforcePreparedMutation = stages.enforcePreparedMutation
	const enforceRelationRead = stages.enforceRelationRead
	const enforceResult = stages.enforceResult
	const enforceSelectionResult = stages.enforceSelectionResult
	const evaluate = stages.evaluate
	const reevaluate = stages.reevaluate
	const requiresPreparedMutationItems = stages.requiresPreparedMutationItems

	return {
		enforceOperation: (input) => {
			onCall()
			return enforceOperation(input)
		},
		enforceResult: (input) => {
			onCall()
			return enforceResult(input)
		},
		enforceSelectionResult: (input) => {
			onCall()
			return enforceSelectionResult(input)
		},
		evaluate: (input) => {
			onCall()
			return evaluate(input)
		},
		reevaluate: (input) => {
			onCall()
			return reevaluate(input)
		},
		...(enforceMutationOutcome === undefined
			? {}
			: {
					enforceMutationOutcome: (input) => {
						onCall()
						return enforceMutationOutcome(input)
					},
				}),
		...(enforcePreparedMutation === undefined
			? {}
			: {
					enforcePreparedMutation: (input) => {
						onCall()
						return enforcePreparedMutation(input)
					},
				}),
		...(enforceRelationRead === undefined
			? {}
			: {
					enforceRelationRead: (input) => {
						onCall()
						return enforceRelationRead(input)
					},
				}),
		...(requiresPreparedMutationItems === undefined
			? {}
			: {
					requiresPreparedMutationItems: (operation) => {
						onCall()
						return requiresPreparedMutationItems(operation)
					},
				}),
	}
}

const wrapRuntimeStages = (
	stages: Readonly<RuntimePipelineStages>,
	counters: MutableRuntimeCostCounters,
): RuntimePipelineStages => {
	const behaviors = stages.behaviors
	const enforcement = stages.enforcement

	counters.runtimeAssemblies += 1
	if (behaviors !== undefined) {
		counters.behaviorBundles += 1
		counters.behaviorStages += countStages(behaviors)
	}
	if (enforcement !== undefined) {
		counters.enforcementBundles += 1
		counters.enforcementStages += countStages(enforcement)
	}

	return {
		...stages,
		...(behaviors === undefined
			? {}
			: {
					behaviors: wrapBehaviorStages(behaviors, () => {
						counters.behaviorStageCalls += 1
					}),
				}),
		...(enforcement === undefined
			? {}
			: {
					enforcement: wrapEnforcementStages(enforcement, () => {
						counters.enforcementStageCalls += 1
					}),
				}),
	}
}

/** Subtracts one immutable sample so read and mutation work can be isolated. */
export const diffRuntimeCostSnapshots = (
	after: RuntimeCostSnapshot,
	before: RuntimeCostSnapshot,
): RuntimeCostSnapshot =>
	Object.freeze({
		startup: Object.freeze({
			runtimeAssemblies:
				after.startup.runtimeAssemblies - before.startup.runtimeAssemblies,
			behaviorBundles:
				after.startup.behaviorBundles - before.startup.behaviorBundles,
			behaviorStages:
				after.startup.behaviorStages - before.startup.behaviorStages,
			enforcementBundles:
				after.startup.enforcementBundles - before.startup.enforcementBundles,
			enforcementStages:
				after.startup.enforcementStages - before.startup.enforcementStages,
		}),
		requests: Object.freeze({
			behaviorStageCalls:
				after.requests.behaviorStageCalls - before.requests.behaviorStageCalls,
			enforcementStageCalls:
				after.requests.enforcementStageCalls -
				before.requests.enforcementStageCalls,
		}),
	})

/**
 * Enforces the deterministic no-optional-Runtime regression budget.
 *
 * One instrumented Runtime assembly is expected. Optional behavior and enforcement
 * bundles, their materialized stages, and their request calls must all remain zero.
 */
export const assertNoOptionalRuntimeCost = (
	snapshot: RuntimeCostSnapshot,
): void => {
	if (snapshot.startup.runtimeAssemblies !== 1) {
		throw new Error(
			`Expected one Runtime assembly, received ${String(snapshot.startup.runtimeAssemblies)}.`,
		)
	}

	const optionalMeasurements = [
		snapshot.startup.behaviorBundles,
		snapshot.startup.behaviorStages,
		snapshot.startup.enforcementBundles,
		snapshot.startup.enforcementStages,
		snapshot.requests.behaviorStageCalls,
		snapshot.requests.enforcementStageCalls,
	]
	if (optionalMeasurements.some((measurement) => measurement !== 0)) {
		throw new Error('Expected no optional Runtime work in any measured unit.')
	}
}

/**
 * Instruments optional Runtime bundles through the public replacement boundary.
 *
 * The probe is intended for isolated tests and benchmarks. It delegates execution
 * to `RuntimePipeline` and therefore must not be combined with another executor
 * replacement in the same application.
 *
 * @example
 * ```ts
 * const probe = new RuntimeCostProbe()
 * const ultimabase = new UltimaBase({ plugins: [probe.plugin, databasePlugin] })
 * await ultimabase.start()
 * console.log(probe.snapshot())
 * ```
 */
export class RuntimeCostProbe {
	readonly plugin: PluginDefinition
	readonly #counters: MutableRuntimeCostCounters = {
		runtimeAssemblies: 0,
		behaviorBundles: 0,
		behaviorStages: 0,
		enforcementBundles: 0,
		enforcementStages: 0,
		behaviorStageCalls: 0,
		enforcementStageCalls: 0,
	}

	constructor(options: RuntimeCostProbeOptions = {}) {
		this.plugin = definePlugin({
			pluginId: 'ultimabase.testing.runtime-cost-probe',
			...(options.instanceId === undefined
				? {}
				: { instanceId: options.instanceId }),
			version: '0.0.0',
			core: '^0.0.0',
			privileges: [
				{
					name: 'runtime:replace',
					reason:
						'Measures the assembled optional Runtime stage graph in tests.',
				},
			],
			capabilities: {
				replaces: [
					replaceRuntime({
						contributionId: 'runtime-cost-probe',
						create: () => ({
							value: (stages) =>
								new RuntimePipeline(wrapRuntimeStages(stages, this.#counters)),
						}),
					}),
				],
			},
		})
		Object.freeze(this)
	}

	/** Returns one detached immutable view of all work observed so far. */
	snapshot(): RuntimeCostSnapshot {
		return Object.freeze({
			startup: Object.freeze({
				runtimeAssemblies: this.#counters.runtimeAssemblies,
				behaviorBundles: this.#counters.behaviorBundles,
				behaviorStages: this.#counters.behaviorStages,
				enforcementBundles: this.#counters.enforcementBundles,
				enforcementStages: this.#counters.enforcementStages,
			}),
			requests: Object.freeze({
				behaviorStageCalls: this.#counters.behaviorStageCalls,
				enforcementStageCalls: this.#counters.enforcementStageCalls,
			}),
		})
	}
}
