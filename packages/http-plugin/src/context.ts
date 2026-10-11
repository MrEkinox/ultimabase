import {
	defineCapability,
	provideCapability,
	type AnonymousRequestAccess,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type CapabilityProviderContribution,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
	type CompiledSchemaRegistry,
	type PluginCapabilityReader,
	type PluginIdentity,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import type { HttpBrowserPolicy } from './browser-policy.js'
import { HttpDefinitionRegistry, assertExactOptions } from './definitions.js'
import { RequestContext, RequestContextValue } from '@ultimabase/core/plugin'

/** Supplies one resolver with the current safe context and credential request view. */
export interface HttpContextResolverInput<TSource extends string = string> {
	/** Carries the exact immutable browser policy owned by this HTTP application. */
	readonly browserPolicy: HttpBrowserPolicy
	readonly context: RequestContext<AnonymousRequestAccess, TSource>
	readonly request: Request
}

/** Derives plugin-owned values without changing anonymous Core authority. */
export type HttpContextResolver<TSource extends string = string> = (
	input: HttpContextResolverInput<TSource>,
) => MaybePromise<RequestContext<AnonymousRequestAccess, TSource>>

/** Declares one immutable ordered request-context resolver. */
export interface HttpContextResolverDefinition {
	readonly resolve: HttpContextResolver
	readonly validateBrowserPolicy?: HttpContextResolverBrowserPolicyValidator
}

/** Validates one resolver's requirements against the effective HTTP policy. */
export type HttpContextResolverBrowserPolicyValidator = (
	policy: HttpBrowserPolicy,
) => void

/** Configures one resolver that must preserve HTTP-owned context invariants. */
export interface HttpContextResolverOptions {
	readonly resolve: HttpContextResolver
	/** Rejects application materialization when the effective policy is unsafe. */
	readonly validateBrowserPolicy?: HttpContextResolverBrowserPolicyValidator
}

const contextResolverDefinitions =
	new HttpDefinitionRegistry<HttpContextResolverDefinition>(
		'httpContextResolver',
	)

/** Creates one context resolver without registering global transport behavior. */
export const httpContextResolver = (
	options: HttpContextResolverOptions,
): HttpContextResolverDefinition => {
	assertExactOptions(
		options,
		['resolve', 'validateBrowserPolicy'],
		'HTTP context resolver options',
	)
	if (typeof options.resolve !== 'function') {
		throw new TypeError('HTTP context resolver must be a function')
	}
	if (
		options.validateBrowserPolicy !== undefined &&
		typeof options.validateBrowserPolicy !== 'function'
	) {
		throw new TypeError(
			'HTTP context resolver validateBrowserPolicy must be a function',
		)
	}

	return contextResolverDefinitions.register(
		immutableRecord({
			resolve: options.resolve,
			...(options.validateBrowserPolicy === undefined
				? {}
				: { validateBrowserPolicy: options.validateBrowserPolicy }),
		}),
	)
}

/** Composes credential resolvers in plugin graph and registration order. */
export type HttpContextResolverContributionsCapability = CapabilityToken<
	readonly HttpContextResolverDefinition[],
	readonly HttpContextResolverDefinition[],
	'ultimabase.http.context-resolvers',
	'1.0.0',
	'multiple',
	'application'
>

export const httpContextResolverContributionsCapability: HttpContextResolverContributionsCapability =
	defineCapability<
		readonly HttpContextResolverDefinition[],
		readonly HttpContextResolverDefinition[]
	>()({
		capabilityId: 'ultimabase.http.context-resolvers',
		version: '1.0.0',
		cardinality: 'multiple',
		lifetime: 'application',
		compose: (providers) => immutableArray(providers.flat()),
	})

/** Supplies resolver factories with declared capabilities and compiled schemas only. */
export interface HttpContextResolverFactoryContext {
	readonly capabilities: PluginCapabilityReader<'materialization'>
	readonly schemas: CompiledSchemaRegistry
}

export type HttpContextResolverFactory = (
	context: HttpContextResolverFactoryContext,
) => MaybePromise<
	HttpContextResolverDefinition | readonly HttpContextResolverDefinition[]
>

/** Configures one owner-attributed group of HTTP context resolvers. */
export interface ProvideHttpContextResolversOptions {
	readonly contributionId: string
	readonly create: HttpContextResolverFactory
}

/** Provides ordered context resolvers while keeping their credentials request-local. */
export const provideHttpContextResolvers = (
	options: ProvideHttpContextResolversOptions,
): CapabilityProviderDeclaration<
	typeof httpContextResolverContributionsCapability
> =>
	provideCapability(
		httpContextResolverContributionsCapability,
		contextResolverDefinitions.contribution(options, 'HTTP context resolver'),
	)

interface OwnedHttpContextResolver {
	readonly owner: PluginIdentity
	readonly resolve: HttpContextResolver
}

interface HttpContextLineage {
	readonly request: object
}

const httpContextLineage = new RequestContextValue<HttpContextLineage>(
	'ultimabase.http.context-lineage',
	(value) => {
		if (!isPlainRecord(value) || !isPlainRecord(value.request)) {
			throw new TypeError('HTTP context lineage must be transport-owned')
		}
		return immutableRecord({ request: value.request })
	},
)

/** @internal Retains exact owners and validates the ordered resolver contributions. */
export const compileHttpContextResolvers = (
	contributions: readonly CapabilityProviderContribution<HttpContextResolverContributionsCapability>[],
	browserPolicy: HttpBrowserPolicy,
	callbacks: ApplicationCallbackExecutor,
): readonly OwnedHttpContextResolver[] => {
	const resolvers: OwnedHttpContextResolver[] = []
	for (const contribution of contributions) {
		const definitions = contextResolverDefinitions.validate(
			contribution.value,
			`HTTP context resolver capability ${contribution.owner.pluginId}/${contribution.contributionId}`,
		)
		for (const definition of definitions) {
			const validationResult = callbacks.runPlugin(contribution.owner, () =>
				definition.validateBrowserPolicy?.(browserPolicy),
			)
			if (validationResult !== undefined) {
				throw new TypeError(
					'HTTP context resolver browser policy validation must be synchronous and return undefined',
				)
			}
			resolvers.push(
				immutableRecord({
					owner: immutableRecord(contribution.owner),
					resolve: definition.resolve,
				}),
			)
		}
	}
	return immutableArray(resolvers)
}

const assertDerivedAnonymousContext: <TSource extends string>(
	previous: RequestContext<AnonymousRequestAccess, TSource>,
	candidate: unknown,
	lineage: HttpContextLineage,
) => asserts candidate is RequestContext<AnonymousRequestAccess, TSource> = (
	previous,
	candidate,
	lineage,
) => {
	if (!(candidate instanceof RequestContext)) {
		throw new TypeError(
			'HTTP context resolvers must return an anonymous context derived from their input',
		)
	}
	const checked = candidate as RequestContext
	const sameCapabilities =
		checked.capabilities.length === previous.capabilities.length &&
		checked.capabilities.every(
			(capability, index) => capability === previous.capabilities[index],
		)
	const previousMetadataKeys = Object.keys(previous.metadata)
	const sameMetadata =
		Object.keys(checked.metadata).length === previousMetadataKeys.length &&
		previousMetadataKeys.every(
			(key) => checked.metadata[key] === previous.metadata[key],
		)
	if (
		checked.access.mode !== 'anonymous' ||
		checked.requestId !== previous.requestId ||
		checked.source !== previous.source ||
		checked.signal !== previous.signal ||
		checked.getValue(httpContextLineage)?.request !== lineage.request ||
		!sameMetadata ||
		!sameCapabilities
	) {
		throw new TypeError(
			'HTTP context resolvers must return an anonymous context derived from their input',
		)
	}
}

/** @internal Runs every resolver within the exact application request scope. */
export const resolveHttpContext = async <TSource extends string>(
	initial: RequestContext<AnonymousRequestAccess, TSource>,
	request: Request,
	browserPolicy: HttpBrowserPolicy,
	resolvers: readonly OwnedHttpContextResolver[],
	requestExecution: ApplicationRequestExecutor,
	callbacks: ApplicationCallbackExecutor,
): Promise<RequestContext<AnonymousRequestAccess, TSource>> => {
	const lineage = immutableRecord({ request: {} })
	let context = initial.withValue(httpContextLineage, lineage)
	for (const resolver of resolvers) {
		const resolved = await callbacks.runPlugin(resolver.owner, () =>
			requestExecution.runWithContext(context, (activeContext) =>
				resolver.resolve({ browserPolicy, context: activeContext, request }),
			),
		)
		assertDerivedAnonymousContext(context, resolved, lineage)
		context = resolved
	}
	return context
}
