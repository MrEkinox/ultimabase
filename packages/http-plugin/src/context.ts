import {
	PluginError,
	type AnonymousRequestAccess,
	type ApplicationRequestExecutor,
	type CompiledSchemaRegistry,
	type PluginErrorPayload,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import type { HttpBrowserPolicy } from './browser-policy.js'
import { HttpDefinitionRegistry, assertExactOptions } from './definitions.js'
import {
	RequestContext,
	RequestContextValue,
	defineCapability,
	provideCapability,
	type ApplicationCallbackExecutor,
	type CapabilityProviderContribution,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
	type PluginCapabilityReader,
	type PluginIdentity,
} from '@ultimabase/core/plugin'

/** Supplies one resolver with the current safe context and credential request view. */
export interface HttpContextResolverInput<TSource extends string = string> {
	/** Carries the exact immutable browser policy owned by this HTTP application. */
	readonly browserPolicy: HttpBrowserPolicy
	/**
	 * The client address: the socket peer, or behind `trustProxy` the nearest
	 * untrusted `X-Forwarded-For` entry; `undefined` when neither names the
	 * client, as behind a fetch handler without `trustProxy`.
	 */
	readonly clientAddress: string | undefined
	readonly context: RequestContext<AnonymousRequestAccess, TSource>
	readonly request: Request
}

/** Derives plugin-owned values without changing anonymous Core authority. */
export type HttpContextResolver<TSource extends string = string> = (
	input: HttpContextResolverInput<TSource>,
) => MaybePromise<RequestContext<AnonymousRequestAccess, TSource>>

/**
 * The `PluginError` codes one resolver throws, each with the HTTP status the
 * HTTP plugin answers it with (400 to 599).
 * @example `{ AUTH_INVALID_SESSION: 401 }`
 */
export type HttpContextResolverErrors = Readonly<Record<string, number>>

/** Declares one immutable ordered request-context resolver. */
export interface HttpContextResolverDefinition {
	readonly errors?: HttpContextResolverErrors
	readonly resolve: HttpContextResolver
	readonly validateBrowserPolicy?: HttpContextResolverBrowserPolicyValidator
}

/** Validates one resolver's requirements against the effective HTTP policy. */
export type HttpContextResolverBrowserPolicyValidator = (
	policy: HttpBrowserPolicy,
) => void

/** Configures one resolver that must preserve HTTP-owned context invariants. */
export interface HttpContextResolverOptions {
	/**
	 * Errors the resolver throws as a `PluginError`, with their HTTP status:
	 * the HTTP plugin answers them with their code and public message. Any
	 * other failure answers 401 `HTTP_APPLICATION_REJECTED`.
	 * @example `errors: { AUTH_INVALID_SESSION: 401 }`
	 */
	readonly errors?: HttpContextResolverErrors
	readonly resolve: HttpContextResolver
	/** Rejects application materialization when the effective policy is unsafe. */
	readonly validateBrowserPolicy?: HttpContextResolverBrowserPolicyValidator
}

const contextResolverDefinitions =
	new HttpDefinitionRegistry<HttpContextResolverDefinition>(
		'httpContextResolver',
	)

// Copies user-controlled codes without assigning keys such as `__proto__`.
const snapshotResolverErrors = (value: unknown): HttpContextResolverErrors => {
	if (!isPlainRecord(value)) {
		throw new TypeError(
			'HTTP context resolver errors must map error codes to statuses',
		)
	}
	const entries: (readonly [string, number])[] = []
	for (const [code, status] of Object.entries(value)) {
		if (code.length === 0) {
			throw new TypeError('HTTP context resolver error code must not be empty')
		}
		if (
			typeof status !== 'number' ||
			!Number.isInteger(status) ||
			status < 400 ||
			status > 599
		) {
			throw new TypeError(
				`HTTP context resolver error ${code} needs a status from 400 to 599`,
			)
		}
		entries.push([code, status])
	}
	return immutableRecord(Object.fromEntries(entries))
}

/** Creates one context resolver without registering global transport behavior. */
export const httpContextResolver = (
	options: HttpContextResolverOptions,
): HttpContextResolverDefinition => {
	assertExactOptions(
		options,
		['errors', 'resolve', 'validateBrowserPolicy'],
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

	const errors =
		options.errors === undefined
			? undefined
			: snapshotResolverErrors(options.errors)
	return contextResolverDefinitions.register(
		immutableRecord({
			...(errors === undefined ? {} : { errors }),
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

const isPluginError = (error: unknown): error is PluginError =>
	error instanceof PluginError

interface OwnedHttpContextResolver {
	readonly errors: ReadonlyMap<string, number>
	readonly owner: PluginIdentity
	readonly resolve: HttpContextResolver
}

/**
 * @internal An error a resolver declared, answered with its status and public
 * payload instead of `HTTP_APPLICATION_REJECTED` (ADR-0341).
 */
export class HttpDeclaredContextError extends Error {
	readonly payload: PluginErrorPayload
	readonly status: number

	constructor(status: number, payload: PluginErrorPayload) {
		super(payload.code)
		this.name = 'HttpDeclaredContextError'
		this.payload = payload
		this.status = status
	}
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
					errors: new Map(Object.entries(definition.errors ?? {})),
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
	clientAddress: string | undefined,
	browserPolicy: HttpBrowserPolicy,
	resolvers: readonly OwnedHttpContextResolver[],
	requestExecution: ApplicationRequestExecutor,
	callbacks: ApplicationCallbackExecutor,
): Promise<RequestContext<AnonymousRequestAccess, TSource>> => {
	const lineage = immutableRecord({ request: {} })
	let context = initial.withValue(httpContextLineage, lineage)
	for (const resolver of resolvers) {
		let resolved: unknown
		try {
			resolved = await callbacks.runPlugin(resolver.owner, () =>
				requestExecution.runWithContext(context, (activeContext) =>
					resolver.resolve({
						browserPolicy,
						clientAddress,
						context: activeContext,
						request,
					}),
				),
			)
		} catch (error: unknown) {
			// Only the throwing resolver's own declaration makes an error public.
			const status = isPluginError(error)
				? resolver.errors.get(error.code)
				: undefined
			if (isPluginError(error) && status !== undefined) {
				throw new HttpDeclaredContextError(status, error.toJSON())
			}
			throw error
		}
		assertDerivedAnonymousContext(context, resolved, lineage)
		context = resolved
	}
	return context
}
