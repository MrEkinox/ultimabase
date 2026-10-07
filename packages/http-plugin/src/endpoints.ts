import {
	defineCapability,
	provideCapability,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
	type CompiledSchemaRegistry,
	type PluginCapabilityReader,
} from '@ultimabase/core'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import { isHttpMethod, isReservedHttpPath } from './constants.js'
import { HttpDefinitionRegistry, assertExactOptions } from './definitions.js'

/** Names one protocol whose handler owns response and post-dispatch errors. */
export interface HttpEndpointProtocol<
	TName extends string = string,
	TVersion extends string = string,
> {
	readonly name: TName
	readonly version: TVersion
}

/** Lists the exact methods accepted by an owned HTTP route. */
export type HttpMethod =
	'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT'

/** Handles one selected Fetch request and returns one Fetch response. */
export type HttpRequestHandler = (request: Request) => MaybePromise<Response>

/** Declares one exact method and path owned by a contributing plugin. */
export interface HttpRouteDefinition<
	TMethod extends HttpMethod = HttpMethod,
	TPath extends string = string,
	TProtocol extends HttpEndpointProtocol = HttpEndpointProtocol,
> {
	readonly kind: 'route'
	readonly method: TMethod
	readonly path: TPath
	readonly protocol: TProtocol
	readonly handle: HttpRequestHandler
}

/** Declares one exact GET page that a browser may open without custom headers. */
export interface HttpBrowserBootstrapRouteDefinition<
	TPath extends string = string,
	TProtocol extends HttpEndpointProtocol = HttpEndpointProtocol,
> {
	readonly kind: 'browser-bootstrap'
	readonly method: 'GET'
	readonly path: TPath
	readonly protocol: TProtocol
	readonly handle: HttpRequestHandler
}

/** Declares one path subtree handled by a contributing Fetch application. */
export interface HttpMountDefinition<
	TPath extends string = string,
	TProtocol extends HttpEndpointProtocol = HttpEndpointProtocol,
> {
	readonly kind: 'mount'
	readonly path: TPath
	readonly protocol: TProtocol
	readonly handle: HttpRequestHandler
}

/** Groups the three non-ambiguous endpoint forms accepted by the HTTP engine. */
export type HttpEndpointDefinition =
	| HttpBrowserBootstrapRouteDefinition
	| HttpMountDefinition
	| HttpRouteDefinition

/** Configures one exact owned route. */
export interface HttpRouteOptions<
	TMethod extends HttpMethod,
	TPath extends string,
	TProtocol extends HttpEndpointProtocol,
> {
	readonly method: TMethod
	readonly path: TPath
	readonly protocol: TProtocol
	readonly handle: HttpRequestHandler
}

/** Configures one owned mount rooted at an absolute path. */
export interface HttpMountOptions<
	TPath extends string,
	TProtocol extends HttpEndpointProtocol,
> {
	readonly path: TPath
	readonly protocol: TProtocol
	readonly handle: HttpRequestHandler
}

/** Configures one exact browser bootstrap route suffix. */
export interface HttpBrowserBootstrapRouteOptions<
	TPath extends string,
	TProtocol extends HttpEndpointProtocol,
> {
	readonly path: TPath
	readonly protocol: TProtocol
	readonly handle: HttpRequestHandler
}

/** @internal Remembers the endpoints created by the three factories below. */
export const endpointDefinitions: HttpDefinitionRegistry<HttpEndpointDefinition> =
	new HttpDefinitionRegistry<HttpEndpointDefinition>(
		'httpRoute, httpMount, or httpBrowserBootstrapRoute',
	)

const endpointLabels = {
	route: 'HTTP route',
	mount: 'HTTP mount',
	'browser-bootstrap': 'HTTP browser bootstrap route',
} as const

// Validates in the public error order: options, method, path, handle; the
// protocol is snapshotted last while the definition is built.
const assertEndpointOptions = (
	options: unknown,
	kind: HttpEndpointDefinition['kind'],
): void => {
	const label = endpointLabels[kind]
	assertExactOptions(
		options,
		kind === 'route'
			? ['handle', 'method', 'path', 'protocol']
			: ['handle', 'path', 'protocol'],
		`${label} options`,
	)
	if (kind === 'route' && !isHttpMethod(options.method)) {
		throw new TypeError(
			'HTTP route method must be a supported uppercase method',
		)
	}
	const path = options.path
	assertNonEmptyString(path, `${label} path`)
	if (
		!path.startsWith('/') ||
		path.includes('?') ||
		path.includes('#') ||
		(path.length > 1 && path.endsWith('/'))
	) {
		throw new TypeError(
			`${label} path must be an absolute path without a query, fragment, or trailing slash`,
		)
	}
	if (isReservedHttpPath(path)) {
		throw new TypeError(
			`${label} path cannot use the reserved browser bootstrap namespace`,
		)
	}
	if (kind === 'browser-bootstrap' && path === '/') {
		throw new TypeError(
			'HTTP browser bootstrap route path must have at least one segment',
		)
	}
	if (typeof options.handle !== 'function') {
		throw new TypeError(`${label} handle must be a function`)
	}
}

const snapshotProtocol = <const TProtocol extends HttpEndpointProtocol>(
	protocol: TProtocol,
): Readonly<TProtocol> => {
	assertExactOptions(protocol, ['name', 'version'], 'HTTP endpoint protocol')
	assertNonEmptyString(protocol.name, 'HTTP endpoint protocol name')
	assertNonEmptyString(protocol.version, 'HTTP endpoint protocol version')
	// The exact-key check above proves the copy has the caller's literal shape.
	return immutableRecord({
		name: protocol.name,
		version: protocol.version,
	}) as Readonly<TProtocol>
}

/** Creates one immutable exact route without registering it globally. */
export const httpRoute = <
	const TMethod extends HttpMethod,
	const TPath extends string,
	const TProtocol extends HttpEndpointProtocol,
>(
	options: HttpRouteOptions<TMethod, TPath, TProtocol>,
): HttpRouteDefinition<TMethod, TPath, TProtocol> => {
	assertEndpointOptions(options, 'route')
	return endpointDefinitions.register(
		immutableRecord({
			kind: 'route' as const,
			method: options.method,
			path: options.path,
			protocol: snapshotProtocol(options.protocol),
			handle: options.handle,
		}),
	)
}

/** Creates one immutable path mount without selecting a concrete server. */
export const httpMount = <
	const TPath extends string,
	const TProtocol extends HttpEndpointProtocol,
>(
	options: HttpMountOptions<TPath, TProtocol>,
): HttpMountDefinition<TPath, TProtocol> => {
	assertEndpointOptions(options, 'mount')
	return endpointDefinitions.register(
		immutableRecord({
			kind: 'mount' as const,
			path: options.path,
			protocol: snapshotProtocol(options.protocol),
			handle: options.handle,
		}),
	)
}

/** Creates one immutable browser bootstrap route without selecting an app. */
export const httpBrowserBootstrapRoute = <
	const TPath extends string,
	const TProtocol extends HttpEndpointProtocol,
>(
	options: HttpBrowserBootstrapRouteOptions<TPath, TProtocol>,
): HttpBrowserBootstrapRouteDefinition<TPath, TProtocol> => {
	assertEndpointOptions(options, 'browser-bootstrap')
	return endpointDefinitions.register(
		immutableRecord({
			handle: options.handle,
			kind: 'browser-bootstrap' as const,
			method: 'GET' as const,
			path: options.path,
			protocol: snapshotProtocol(options.protocol),
		}),
	)
}

/** Composes every endpoint declaration in plugin graph and registration order. */
export type HttpEndpointContributionsCapability = CapabilityToken<
	readonly HttpEndpointDefinition[],
	readonly HttpEndpointDefinition[],
	'ultimabase.http.endpoints',
	'1.0.0',
	'multiple',
	'application'
>

export const httpEndpointContributionsCapability: HttpEndpointContributionsCapability =
	defineCapability<
		readonly HttpEndpointDefinition[],
		readonly HttpEndpointDefinition[]
	>()({
		capabilityId: 'ultimabase.http.endpoints',
		version: '1.0.0',
		cardinality: 'multiple',
		lifetime: 'application',
		providerPrivilege: 'transport:expose',
		compose: (providers) => immutableArray(providers.flat()),
	})

/** Supplies route factories with only declared capabilities and compiled schemas. */
export interface HttpEndpointContributionFactoryContext {
	readonly capabilities: PluginCapabilityReader<'materialization'>
	readonly schemas: CompiledSchemaRegistry
}

export type HttpEndpointContributionFactory = (
	context: HttpEndpointContributionFactoryContext,
) => MaybePromise<HttpEndpointDefinition | readonly HttpEndpointDefinition[]>

/** Configures one owner-attributed group of HTTP endpoints. */
export interface ProvideHttpEndpointsOptions {
	readonly contributionId: string
	readonly create: HttpEndpointContributionFactory
}

/** Provides owned endpoints while leaving application assembly to httpPlugin(). */
export const provideHttpEndpoints = (
	options: ProvideHttpEndpointsOptions,
): CapabilityProviderDeclaration<typeof httpEndpointContributionsCapability> =>
	provideCapability(
		httpEndpointContributionsCapability,
		endpointDefinitions.contribution(options, 'HTTP endpoint'),
	)
