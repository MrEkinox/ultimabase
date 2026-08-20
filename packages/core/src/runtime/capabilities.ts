import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	defineCapability,
	provideCapability,
	replaceCapability,
	type ApplicationCapabilityFactory,
	type CapabilityContributionTarget,
	type CapabilityProviderDeclaration,
	type CapabilityReplacementDeclaration,
	type CapabilityToken,
} from '../plugins/capabilities.js'
import type { PluginIdentity, PluginPrivilege } from '../plugins/manifest.js'
import type { OperationKind } from '../query/index.js'
import type { SchemaDefinition } from '../schema/index.js'
import type { EnforcementContributionKind } from './enforcement/contracts.js'
import { getEnforcementContributionImplementation } from './enforcement/definitions.js'
import {
	getProtectedPolicyImplementation,
	type ProtectedPolicyDefinition,
} from './enforcement/protected-policy.js'
import { getRuntimeContributionImplementation } from './hooks/definitions.js'
import { getHookEventImplementation } from './hooks/events.js'
import { RuntimePipeline } from './pipeline/runtime-pipeline.js'
import type { RuntimePipelineStages } from './pipeline/contracts.js'
import type { RuntimeBehaviorStages } from './pipeline/contracts.js'
import {
	getRuntimePipelineStageImplementation,
	type RuntimePipelineStageName,
} from './pipeline/definitions.js'

/** Lists the public logical boundaries that authorized middleware may intercept. */
export type RuntimeInterceptorDefinition =
	| Readonly<{
			kind: 'after-operation' | 'before-operation' | 'prepared-operation'
			operations: readonly OperationKind[] | undefined
			schema: SchemaDefinition | undefined
	  }>
	| Readonly<{ stage: RuntimePipelineStageName }>

/** Lists the monotonic definitions that can only narrow protected execution. */
export type RuntimeConstraintDefinition =
	| Readonly<{
			kind: EnforcementContributionKind
			operations: readonly OperationKind[] | undefined
			schema: SchemaDefinition | undefined
	  }>
	| ProtectedPolicyDefinition

/** Lists result and committed-event observers that cannot replace execution values. */
export type RuntimeObserverDefinition =
	| Readonly<{ kind: 'hook-event'; name: string }>
	| Readonly<{
			kind: 'post-commit-event'
			operations: readonly OperationKind[] | undefined
			schema: SchemaDefinition | undefined
	  }>

/** Constructs one Runtime executor from the complete Core-owned mandatory stage graph. */
export type RuntimeExecutorFactory = (
	stages: Readonly<RuntimePipelineStages>,
) => RuntimePipeline

/** Composes application-local product behavior without exposing Core internals. */
export const runtimeBehaviorCapability: CapabilityToken<
	RuntimeBehaviorStages,
	readonly RuntimeBehaviorStages[],
	'ultimabase.runtime-behaviors',
	'1.0.0',
	'multiple',
	'application'
> = defineCapability<RuntimeBehaviorStages, readonly RuntimeBehaviorStages[]>()(
	{
		capabilityId: 'ultimabase.runtime-behaviors',
		version: '1.0.0',
		cardinality: 'multiple',
		lifetime: 'application',
		compose: (providers) =>
			immutableArray(providers.map(assertRuntimeBehavior)),
	},
)

/** Composes logical interceptors in deterministic plugin graph order. */
export const runtimeInterceptorCapability: CapabilityToken<
	RuntimeInterceptorDefinition,
	readonly RuntimeInterceptorDefinition[],
	'ultimabase.runtime-interceptors',
	'1.0.0',
	'pipeline',
	'application'
> = defineCapability<
	RuntimeInterceptorDefinition,
	readonly RuntimeInterceptorDefinition[]
>()({
	capabilityId: 'ultimabase.runtime-interceptors',
	version: '1.0.0',
	cardinality: 'pipeline',
	lifetime: 'application',
	compose: (providers) =>
		immutableArray(providers.map(assertRuntimeInterceptorDefinition)),
})

/** Composes independent monotonic providers without exposing accumulated state. */
export const runtimeConstraintCapability: CapabilityToken<
	RuntimeConstraintDefinition,
	readonly RuntimeConstraintDefinition[],
	'ultimabase.runtime-constraints',
	'1.0.0',
	'multiple',
	'application'
> = defineCapability<
	RuntimeConstraintDefinition,
	readonly RuntimeConstraintDefinition[]
>()({
	capabilityId: 'ultimabase.runtime-constraints',
	version: '1.0.0',
	cardinality: 'multiple',
	lifetime: 'application',
	compose: (providers) =>
		immutableArray(providers.map(assertRuntimeConstraintDefinition)),
})

/** Composes independent non-transforming observers in graph order. */
export const runtimeObserverCapability: CapabilityToken<
	RuntimeObserverDefinition,
	readonly RuntimeObserverDefinition[],
	'ultimabase.runtime-observers',
	'1.0.0',
	'multiple',
	'application'
> = defineCapability<
	RuntimeObserverDefinition,
	readonly RuntimeObserverDefinition[]
>()({
	capabilityId: 'ultimabase.runtime-observers',
	version: '1.0.0',
	cardinality: 'multiple',
	lifetime: 'application',
	compose: (providers) =>
		immutableArray(providers.map(assertRuntimeObserverDefinition)),
})

/** Selects one complete executor factory behind Core's non-replaceable request shell. */
export const runtimeExecutorCapability: CapabilityToken<
	RuntimeExecutorFactory,
	RuntimeExecutorFactory,
	'ultimabase.runtime-executor',
	'1.0.0',
	'single',
	'application'
> = defineCapability<RuntimeExecutorFactory>()({
	capabilityId: 'ultimabase.runtime-executor',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => {
		if (typeof provider !== 'function') {
			throw new TypeError(
				'runtime executor factories must materialize a function',
			)
		}
		return provider
	},
})

type RuntimeProviderOptions<TDefinition> = Readonly<{
	/** Stable owner-local identity used in diagnostics and deterministic ordering. */
	contributionId: string
	/** Materializes one application-local definition and optional cleanup. */
	create: ApplicationCapabilityFactory<TDefinition>
}>

const interceptorProviders = new WeakSet<object>()
const constraintProviders = new WeakSet<object>()
const observerProviders = new WeakSet<object>()
const runtimeReplacements = new WeakSet<object>()
const behaviorProviders = new WeakSet<object>()

const runtimeBehaviorKeys: ReadonlySet<string> = new Set([
	'beforeOperation',
	'observePreparedMutation',
	'postCommit',
	'requiresPreparedMutationItems',
	'revalidateInput',
	'transformDatabaseResult',
	'transformInput',
	'transformMutationOutcome',
	'transformPreparedInput',
	'transformPreparedOperation',
	'transformResult',
])

const assertRuntimeBehavior = (value: unknown): RuntimeBehaviorStages => {
	if (!isPlainRecord(value)) {
		throw new TypeError('runtime behavior providers must return a plain object')
	}

	for (const key of Object.keys(value)) {
		if (!runtimeBehaviorKeys.has(key)) {
			throw new TypeError(`Unknown runtime behavior stage: ${key}`)
		}
		if (typeof value[key] !== 'function') {
			throw new TypeError(`Runtime behavior stage ${key} must be a function`)
		}
	}

	return immutableRecord(value)
}

const assertRuntimeInterceptorDefinition = (
	definition: unknown,
): RuntimeInterceptorDefinition => {
	const hook = getRuntimeContributionImplementation(definition)
	if (
		getRuntimePipelineStageImplementation(definition) !== undefined ||
		(hook !== undefined && hook.kind !== 'post-commit-event')
	) {
		return definition as RuntimeInterceptorDefinition
	}

	throw new TypeError(
		'runtime interceptor factories must return a definition created by an interceptor factory',
	)
}

const assertRuntimeConstraintDefinition = (
	definition: unknown,
): RuntimeConstraintDefinition => {
	if (
		getEnforcementContributionImplementation(definition) !== undefined ||
		getProtectedPolicyImplementation(definition) !== undefined
	) {
		return definition as RuntimeConstraintDefinition
	}

	throw new TypeError(
		'runtime constraint factories must return a definition created by an enforcement factory',
	)
}

const assertRuntimeObserverDefinition = (
	definition: unknown,
): RuntimeObserverDefinition => {
	const hook = getRuntimeContributionImplementation(definition)
	if (
		getHookEventImplementation(definition) !== undefined ||
		hook?.kind === 'post-commit-event'
	) {
		return definition as RuntimeObserverDefinition
	}

	throw new TypeError(
		'runtime observer factories must return a definition created by an observer factory',
	)
}

/** Declares one logical interceptor through the exact `runtime:intercept` protocol. */
export const provideRuntimeInterceptor = <
	const TDefinition extends RuntimeInterceptorDefinition,
>(
	options: RuntimeProviderOptions<TDefinition>,
): CapabilityProviderDeclaration<typeof runtimeInterceptorCapability> => {
	const declaration = provideCapability(runtimeInterceptorCapability, options)
	interceptorProviders.add(declaration)
	return declaration
}

/** Declares one monotonic provider through the exact `runtime:constrain` protocol. */
export const provideRuntimeConstraint = <
	const TDefinition extends RuntimeConstraintDefinition,
>(
	options: RuntimeProviderOptions<TDefinition>,
): CapabilityProviderDeclaration<typeof runtimeConstraintCapability> => {
	const declaration = provideCapability(runtimeConstraintCapability, options)
	constraintProviders.add(declaration)
	return declaration
}

/** Declares one non-transforming observer through the exact `runtime:observe` protocol. */
export const provideRuntimeObserver = <
	const TDefinition extends RuntimeObserverDefinition,
>(
	options: RuntimeProviderOptions<TDefinition>,
): CapabilityProviderDeclaration<typeof runtimeObserverCapability> => {
	const declaration = provideCapability(runtimeObserverCapability, options)
	observerProviders.add(declaration)
	return declaration
}

/** Declares one optional product behavior through `runtime:intercept`. */
export const provideRuntimeBehavior = (
	options: RuntimeProviderOptions<RuntimeBehaviorStages>,
): CapabilityProviderDeclaration<typeof runtimeBehaviorCapability> => {
	const declaration = provideCapability(runtimeBehaviorCapability, options)
	behaviorProviders.add(declaration)
	return declaration
}

/** Identifies Core's canonical executor when declaring the first replacement. */
export const canonicalRuntimeExecutorTarget: CapabilityContributionTarget =
	immutableRecord({
		owner: immutableRecord({ pluginId: '@ultimabase/core' }),
		contributionId: 'canonical-runtime-executor',
	})

/** Replaces only the executor behind Core's ownership, authority, and transaction shell. */
export const replaceRuntime = (
	options: Readonly<{
		contributionId: string
		create: ApplicationCapabilityFactory<RuntimeExecutorFactory>
		target?: CapabilityContributionTarget
	}>,
): CapabilityReplacementDeclaration<typeof runtimeExecutorCapability> => {
	const declaration = replaceCapability(runtimeExecutorCapability, {
		contributionId: options.contributionId,
		create: options.create,
		target: options.target ?? canonicalRuntimeExecutorTarget,
	})
	runtimeReplacements.add(declaration)
	return declaration
}

const canonicalRuntimeExecutor = provideCapability(runtimeExecutorCapability, {
	contributionId: canonicalRuntimeExecutorTarget.contributionId,
	create: () => ({
		value: (stages) => new RuntimePipeline(stages),
	}),
})

/** Supplies the capability graph with Core's application-lifetime executor provider. */
export const canonicalRuntimeExecutorFoundation: Readonly<{
	declaration: CapabilityProviderDeclaration<typeof runtimeExecutorCapability>
	owner: PluginIdentity
	version: string
}> = immutableRecord({
	declaration: canonicalRuntimeExecutor,
	owner: canonicalRuntimeExecutorTarget.owner,
	version: '0.0.0',
})

/** Resolves the exact privilege attached to a protected Runtime provider token. */
export const runtimeProviderPrivilege = (
	token: CapabilityToken,
): PluginPrivilege | undefined => {
	if (token === runtimeInterceptorCapability) return 'runtime:intercept'
	if (token === runtimeConstraintCapability) return 'runtime:constrain'
	if (token === runtimeObserverCapability) return 'runtime:observe'
	if (token === runtimeBehaviorCapability) return 'runtime:intercept'
	return undefined
}

/** Rejects generic capability providers that would bypass an exact Runtime facade. */
export const isAuthorizedRuntimeProvider = (
	declaration: CapabilityProviderDeclaration,
): boolean =>
	interceptorProviders.has(declaration) ||
	constraintProviders.has(declaration) ||
	observerProviders.has(declaration) ||
	behaviorProviders.has(declaration)

/** Identifies only executor replacements created by the critical public helper. */
export const isRuntimeReplacement = (
	declaration: CapabilityReplacementDeclaration,
): boolean => runtimeReplacements.has(declaration)

/** Identifies every protected Core Runtime protocol token. */
export const isRuntimeCapability = (token: CapabilityToken): boolean =>
	token === runtimeBehaviorCapability ||
	token === runtimeInterceptorCapability ||
	token === runtimeConstraintCapability ||
	token === runtimeObserverCapability ||
	token === runtimeExecutorCapability
