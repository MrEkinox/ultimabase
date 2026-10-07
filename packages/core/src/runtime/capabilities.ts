import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	defineCapability,
	provideCapability,
	type ApplicationCapabilityFactory,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
} from '../plugins/capabilities.js'
import type { PluginPrivilege } from '../plugins/manifest.js'
import type { SchemaDefinition } from '../schema/index.js'
import type { EnforcementContributionKind } from './enforcement/contracts.js'
import { getEnforcementContributionImplementation } from './enforcement/definitions.js'
import {
	getProtectedPolicyImplementation,
	type ProtectedPolicyDefinition,
} from './enforcement/protected-policy.js'
import { getRuntimeContributionImplementation } from './contributions/definitions.js'
import type {
	RuntimeBehaviorStages,
	RuntimeLogicalOperationKind,
} from './pipeline/contracts.js'

/** Lists the public logical boundaries that authorized middleware may intercept. */
export type RuntimeInterceptorDefinition = Readonly<{
	kind: 'after-operation' | 'before-operation' | 'prepared-operation'
	operations: readonly RuntimeLogicalOperationKind[] | undefined
	schema: SchemaDefinition | undefined
}>

/** Lists the monotonic definitions that can only narrow protected execution. */
export type RuntimeConstraintDefinition =
	| Readonly<{
			kind: EnforcementContributionKind
			operations: readonly RuntimeLogicalOperationKind[] | undefined
			schema: SchemaDefinition | undefined
	  }>
	| ProtectedPolicyDefinition

/** Composes application-local product behavior without exposing Core internals. */
export const runtimeBehaviorCapability: CapabilityToken<
	RuntimeBehaviorStages,
	readonly RuntimeBehaviorStages[],
	'ultimabase.runtime-behaviors',
	'3.0.0',
	'multiple',
	'application'
> = defineCapability<RuntimeBehaviorStages, readonly RuntimeBehaviorStages[]>()(
	{
		capabilityId: 'ultimabase.runtime-behaviors',
		version: '3.0.0',
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

type RuntimeProviderOptions<TDefinition> = Readonly<{
	/** Stable owner-local identity used in diagnostics and deterministic ordering. */
	contributionId: string
	/** Materializes one application-local definition and optional cleanup. */
	create: ApplicationCapabilityFactory<TDefinition>
}>

const interceptorProviders = new WeakSet<object>()
const constraintProviders = new WeakSet<object>()
const behaviorProviders = new WeakSet<object>()

const runtimeBehaviorKeys: ReadonlySet<string> = new Set([
	'beforeOperation',
	'guardMutationInput',
	'observePreparedMutation',
	'postCommit',
	'requiresPreparedMutationItems',
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
	const contribution = getRuntimeContributionImplementation(definition)
	if (contribution !== undefined) {
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

/** Declares one optional product behavior through `runtime:intercept`. */
export const provideRuntimeBehavior = (
	options: RuntimeProviderOptions<RuntimeBehaviorStages>,
): CapabilityProviderDeclaration<typeof runtimeBehaviorCapability> => {
	const declaration = provideCapability(runtimeBehaviorCapability, options)
	behaviorProviders.add(declaration)
	return declaration
}

/** Resolves the exact privilege attached to a protected Runtime provider token. */
export const runtimeProviderPrivilege = (
	token: CapabilityToken,
): PluginPrivilege | undefined => {
	if (token === runtimeInterceptorCapability) return 'runtime:intercept'
	if (token === runtimeConstraintCapability) return 'runtime:constrain'
	if (token === runtimeBehaviorCapability) return 'runtime:intercept'
	return undefined
}

/** Rejects generic capability providers that would bypass an exact Runtime facade. */
export const isAuthorizedRuntimeProvider = (
	declaration: CapabilityProviderDeclaration,
): boolean =>
	interceptorProviders.has(declaration) ||
	constraintProviders.has(declaration) ||
	behaviorProviders.has(declaration)

/** Identifies every protected Core Runtime protocol token. */
export const isRuntimeCapability = (token: CapabilityToken): boolean =>
	token === runtimeBehaviorCapability ||
	token === runtimeInterceptorCapability ||
	token === runtimeConstraintCapability
