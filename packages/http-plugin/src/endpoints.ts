import {
	defineCapability,
	provideCapability,
	type ApplicationCapabilityFactoryContext,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
	type CompiledSchemaRegistry,
	type PluginCapabilityReader,
} from '@ultimabase/core'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

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

/** Groups the two non-ambiguous endpoint forms accepted by the HTTP engine. */
export type HttpEndpointDefinition = HttpMountDefinition | HttpRouteDefinition

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

const httpMethods = new Set<HttpMethod>([
	'DELETE',
	'GET',
	'HEAD',
	'OPTIONS',
	'PATCH',
	'POST',
	'PUT',
])
const endpointDefinitions = new WeakSet<object>()
const routeOptionKeys = new Set(['handle', 'method', 'path', 'protocol'])
const mountOptionKeys = new Set(['handle', 'path', 'protocol'])

const assertExactOptions: (
	value: unknown,
	allowedKeys: ReadonlySet<string>,
	path: string,
) => asserts value is Readonly<Record<string, unknown>> = (
	value,
	allowedKeys,
	path,
) => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !allowedKeys.has(key)) {
			throw new TypeError(`${path} contains unknown option: ${String(key)}`)
		}
	}
}

const snapshotProtocol = <const TProtocol extends HttpEndpointProtocol>(
	protocol: TProtocol,
): Readonly<TProtocol> => {
	assertExactOptions(
		protocol,
		new Set(['name', 'version']),
		'HTTP endpoint protocol',
	)
	assertNonEmptyString(protocol.name, 'HTTP endpoint protocol name')
	assertNonEmptyString(protocol.version, 'HTTP endpoint protocol version')
	return immutableRecord({
		name: protocol.name,
		version: protocol.version,
	}) as Readonly<TProtocol>
}

const assertAbsolutePath: (
	path: unknown,
	label: string,
) => asserts path is string = (path, label) => {
	assertNonEmptyString(path, label)
	if (
		!path.startsWith('/') ||
		path.includes('?') ||
		path.includes('#') ||
		(path.length > 1 && path.endsWith('/'))
	) {
		throw new TypeError(
			`${label} must be an absolute path without a query, fragment, or trailing slash`,
		)
	}
}

/** Creates one immutable exact route without registering it globally. */
export const httpRoute = <
	const TMethod extends HttpMethod,
	const TPath extends string,
	const TProtocol extends HttpEndpointProtocol,
>(
	options: HttpRouteOptions<TMethod, TPath, TProtocol>,
): HttpRouteDefinition<TMethod, TPath, TProtocol> => {
	assertExactOptions(options, routeOptionKeys, 'HTTP route options')
	if (!httpMethods.has(options.method)) {
		throw new TypeError(
			'HTTP route method must be a supported uppercase method',
		)
	}
	assertAbsolutePath(options.path, 'HTTP route path')
	if (typeof options.handle !== 'function') {
		throw new TypeError('HTTP route handle must be a function')
	}

	const definition = immutableRecord({
		kind: 'route' as const,
		method: options.method,
		path: options.path,
		protocol: snapshotProtocol(options.protocol),
		handle: options.handle,
	})
	endpointDefinitions.add(definition)
	return definition
}

/** Creates one immutable path mount without selecting a concrete server. */
export const httpMount = <
	const TPath extends string,
	const TProtocol extends HttpEndpointProtocol,
>(
	options: HttpMountOptions<TPath, TProtocol>,
): HttpMountDefinition<TPath, TProtocol> => {
	assertExactOptions(options, mountOptionKeys, 'HTTP mount options')
	assertAbsolutePath(options.path, 'HTTP mount path')
	if (typeof options.handle !== 'function') {
		throw new TypeError('HTTP mount handle must be a function')
	}

	const definition = immutableRecord({
		kind: 'mount' as const,
		path: options.path,
		protocol: snapshotProtocol(options.protocol),
		handle: options.handle,
	})
	endpointDefinitions.add(definition)
	return definition
}

const assertEndpointDefinition: (
	definition: unknown,
	path: string,
) => asserts definition is HttpEndpointDefinition = (definition, path) => {
	if (!isPlainRecord(definition) || !endpointDefinitions.has(definition)) {
		throw new TypeError(`${path} must be created by httpRoute or httpMount`)
	}
}

/** @internal Revalidates every materialized provider, including replacements. */
export const assertHttpEndpointDefinitions: (
	definitions: unknown,
	path: string,
) => asserts definitions is readonly HttpEndpointDefinition[] = (
	definitions,
	path,
) => {
	if (!isUnknownArray(definitions)) {
		throw new TypeError(`${path} must be an array`)
	}
	for (const [index, definition] of definitions.entries()) {
		assertEndpointDefinition(definition, `${path}[${String(index)}]`)
	}
}

/** Composes route and mount declarations in plugin graph and registration order. */
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
): CapabilityProviderDeclaration<
	typeof httpEndpointContributionsCapability
> => {
	assertExactOptions(
		options,
		new Set(['contributionId', 'create']),
		'HTTP endpoint provider options',
	)
	assertNonEmptyString(options.contributionId, 'HTTP endpoint contributionId')
	if (typeof options.create !== 'function') {
		throw new TypeError('HTTP endpoint provider create must be a function')
	}

	return provideCapability(httpEndpointContributionsCapability, {
		contributionId: options.contributionId,
		create: async (
			context: ApplicationCapabilityFactoryContext,
		): Promise<
			Readonly<{ readonly value: readonly HttpEndpointDefinition[] }>
		> => {
			const created = await options.create({
				capabilities: context.capabilities,
				schemas: context.schemas,
			})
			const definitions = isUnknownArray(created) ? created : [created]
			assertHttpEndpointDefinitions(definitions, 'HTTP endpoint contribution')
			return immutableRecord({ value: immutableArray(definitions) })
		},
	})
}
