import {
	defineCapability,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type CapabilityProviderContribution,
	type CapabilityToken,
	type PluginIdentity,
} from '@ultimabase/core'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	httpApplicationIdHeader,
	httpApplicationProtocolVersion,
	httpOriginalHeaderMode,
} from './constants.js'
import type {
	HttpEndpointContributionsCapability,
	HttpEndpointDefinition,
	HttpMountDefinition,
	HttpRequestHandler,
	HttpRouteDefinition,
} from './endpoints.js'
import { assertHttpEndpointDefinitions } from './endpoints.js'

/** Retains the exact plugin owner of one callable endpoint. */
export interface HttpEndpointProvenance {
	readonly contributionId: string
	readonly owner: PluginIdentity
	readonly pluginVersion: string
	readonly registrationIndex: number
}

/** Exposes one validated route together with immutable ownership evidence. */
export interface OwnedHttpRoute extends HttpRouteDefinition {
	readonly provenance: HttpEndpointProvenance
}

/** Exposes one validated mount together with immutable ownership evidence. */
export interface OwnedHttpMount extends HttpMountDefinition {
	readonly provenance: HttpEndpointProvenance
}

export type OwnedHttpEndpoint = OwnedHttpMount | OwnedHttpRoute

/** Gives every provider the same immutable application-local endpoint graph. */
export interface HttpRouteGraph {
	readonly endpoints: readonly OwnedHttpEndpoint[]
	readonly mounts: readonly OwnedHttpMount[]
	readonly routes: readonly OwnedHttpRoute[]
}

/** Carries original header evidence captured before Fetch normalization. */
export type HttpOriginalHeader = readonly [name: string, value: string]

/** Supplies one normalized Fetch request plus its ordered original headers. */
export interface HttpServerRequest {
	readonly request: Request
	readonly originalHeaders: readonly HttpOriginalHeader[]
}

/** Names the immutable application graph consumed by an HTTP server provider. */
export interface HttpApplication {
	readonly appId: string
	readonly protocolVersion: typeof httpApplicationProtocolVersion
	readonly originalHeaderMode: typeof httpOriginalHeaderMode
	readonly routeGraph: HttpRouteGraph
	/** Validates application selection before dispatching one Fetch request. */
	fetch(input: HttpServerRequest): Promise<Response | undefined>
}

interface HttpApplicationState {
	disposed: boolean
	requestExecution: ApplicationRequestExecutor | undefined
}

const httpApplicationStates = new WeakMap<
	HttpApplication,
	HttpApplicationState
>()

const pathsOverlap = (left: string, right: string): boolean =>
	left === '/' ||
	right === '/' ||
	left === right ||
	left.startsWith(`${right}/`) ||
	right.startsWith(`${left}/`)

const throwEndpointCollision = (
	left: HttpEndpointDefinition,
	right: HttpEndpointDefinition,
): never => {
	throw new TypeError(
		`HTTP endpoint collision between ${left.kind} "${left.path}" and ${right.kind} "${right.path}"`,
	)
}

const assertNoEndpointCollision = (
	accepted: readonly OwnedHttpEndpoint[],
	candidate: HttpEndpointDefinition,
): void => {
	for (const endpoint of accepted) {
		if (
			candidate.kind === 'route' &&
			endpoint.kind === 'route' &&
			candidate.method === endpoint.method &&
			candidate.path === endpoint.path
		) {
			throwEndpointCollision(endpoint, candidate)
		}
		if (
			(candidate.kind === 'mount' || endpoint.kind === 'mount') &&
			pathsOverlap(candidate.path, endpoint.path)
		) {
			throwEndpointCollision(endpoint, candidate)
		}
	}
}

const invokeHandler = async (
	handle: HttpRequestHandler,
	request: Request,
	owner: PluginIdentity,
	callbacks: ApplicationCallbackExecutor,
): Promise<Response> => {
	const response = await callbacks.runPlugin(owner, () => handle(request))
	if (!(response instanceof Response)) {
		throw new TypeError('HTTP endpoint handlers must return a Response')
	}
	return response
}

const ownEndpoint = (
	definition: HttpEndpointDefinition,
	contribution: CapabilityProviderContribution<HttpEndpointContributionsCapability>,
	registrationIndex: number,
	callbacks: ApplicationCallbackExecutor,
): OwnedHttpEndpoint => {
	const provenance = immutableRecord({
		contributionId: contribution.contributionId,
		owner: immutableRecord(contribution.owner),
		pluginVersion: contribution.pluginVersion,
		registrationIndex,
	})
	const handle: HttpRequestHandler = (request) =>
		invokeHandler(definition.handle, request, contribution.owner, callbacks)

	return definition.kind === 'route'
		? immutableRecord({ ...definition, handle, provenance })
		: immutableRecord({ ...definition, handle, provenance })
}

const compileRouteGraph = (
	contributions: readonly CapabilityProviderContribution<HttpEndpointContributionsCapability>[],
	callbacks: ApplicationCallbackExecutor,
): HttpRouteGraph => {
	const endpoints: OwnedHttpEndpoint[] = []
	let registrationIndex = 0

	for (const contribution of contributions) {
		assertHttpEndpointDefinitions(
			contribution.value,
			`HTTP endpoint capability ${contribution.owner.pluginId}/${contribution.contributionId}`,
		)
		for (const definition of contribution.value) {
			assertNoEndpointCollision(endpoints, definition)
			endpoints.push(
				ownEndpoint(definition, contribution, registrationIndex, callbacks),
			)
			registrationIndex += 1
		}
	}

	return immutableRecord({
		endpoints: immutableArray(endpoints),
		mounts: immutableArray(
			endpoints.filter(
				(endpoint): endpoint is OwnedHttpMount => endpoint.kind === 'mount',
			),
		),
		routes: immutableArray(
			endpoints.filter(
				(endpoint): endpoint is OwnedHttpRoute => endpoint.kind === 'route',
			),
		),
	})
}

const matchesMount = (pathname: string, mountPath: string): boolean =>
	mountPath === '/' ||
	pathname === mountPath ||
	pathname.startsWith(`${mountPath}/`)

const assertFetchRequest: (request: unknown) => asserts request is Request = (
	request,
) => {
	if (!(request instanceof Request)) {
		throw new TypeError('HTTP application fetch expects a Request')
	}
}

/** @internal Validates the provider boundary without trusting Fetch Headers. */
export const assertHttpServerRequest: (
	input: unknown,
) => asserts input is HttpServerRequest = (input) => {
	if (!isPlainRecord(input) || !(input.request instanceof Request)) {
		throw new TypeError(
			'HTTP server request must contain a Fetch Request and original headers',
		)
	}
	if (!isUnknownArray(input.originalHeaders)) {
		throw new TypeError('HTTP server request must preserve original headers')
	}
	for (const [index, header] of input.originalHeaders.entries()) {
		if (
			!isUnknownArray(header) ||
			header.length !== 2 ||
			typeof header[0] !== 'string' ||
			typeof header[1] !== 'string'
		) {
			throw new TypeError(
				`HTTP original header[${String(index)}] must be a name and value pair`,
			)
		}
	}
}

/** @internal Selects from original evidence and never splits comma-bearing values. */
export const readHttpApplicationId = (input: HttpServerRequest): string => {
	assertHttpServerRequest(input)
	const normalizedName = httpApplicationIdHeader.toLowerCase()
	const values = input.originalHeaders
		.filter(([name]) => name.toLowerCase() === normalizedName)
		.map(([, value]) => value)

	if (values.length !== 1) {
		throw new TypeError('HTTP application request was rejected')
	}
	const value = values[0]
	assertNonEmptyString(value, 'HTTP application ID')
	return value
}

/** @internal Materializes one application graph while keeping Core execution private. */
export const createHttpApplicationResource = (
	appId: string,
	contributions: readonly CapabilityProviderContribution<HttpEndpointContributionsCapability>[],
	requestExecution: ApplicationRequestExecutor,
	callbacks: ApplicationCallbackExecutor,
): Readonly<{
	readonly value: HttpApplication
	readonly dispose: () => void
}> => {
	const routeGraph = compileRouteGraph(contributions, callbacks)
	const application: HttpApplication = immutableRecord({
		appId,
		protocolVersion: httpApplicationProtocolVersion,
		originalHeaderMode: httpOriginalHeaderMode,
		routeGraph,
		fetch: async (input: HttpServerRequest): Promise<Response | undefined> => {
			assertHttpServerRequest(input)
			if (readHttpApplicationId(input) !== appId) {
				throw new TypeError('HTTP application request was rejected')
			}
			const { request } = input
			assertFetchRequest(request)
			const state = httpApplicationStates.get(application)
			if (
				state === undefined ||
				state.disposed ||
				state.requestExecution === undefined
			) {
				throw new TypeError('HTTP application is no longer available')
			}
			const url = new URL(request.url)
			const route = routeGraph.routes.find(
				(candidate) =>
					candidate.method === request.method &&
					candidate.path === url.pathname,
			)
			if (route !== undefined) return route.handle(request)

			const mount = routeGraph.mounts.find((candidate) =>
				matchesMount(url.pathname, candidate.path),
			)
			return mount?.handle(request)
		},
	})
	httpApplicationStates.set(application, {
		disposed: false,
		requestExecution,
	})

	return immutableRecord({
		value: application,
		dispose: () => {
			const state = httpApplicationStates.get(application)
			if (state === undefined) return
			state.disposed = true
			state.requestExecution = undefined
		},
	})
}

const assertHttpApplication: (
	application: unknown,
) => asserts application is HttpApplication = (application) => {
	if (!isPlainRecord(application)) {
		throw new TypeError('HTTP application capability must be a plain object')
	}
	if (application.protocolVersion !== httpApplicationProtocolVersion) {
		throw new TypeError(
			`Unsupported HTTP application protocol version: ${String(application.protocolVersion)}`,
		)
	}
	if (application.originalHeaderMode !== httpOriginalHeaderMode) {
		throw new TypeError(
			'HTTP application requires ordered original header pairs',
		)
	}
	if (typeof application.appId !== 'string' || application.appId.length === 0) {
		throw new TypeError('HTTP application appId must be a non-empty string')
	}
	if (
		!isPlainRecord(application.routeGraph) ||
		typeof application.fetch !== 'function'
	) {
		throw new TypeError('HTTP application capability is malformed')
	}
}

/** Carries one versioned HTTP application from httpPlugin() to server providers. */
export const httpApplicationCapability: CapabilityToken<
	HttpApplication,
	HttpApplication,
	'ultimabase.http.application',
	'1.0.0',
	'single',
	'application'
> = defineCapability<HttpApplication>()({
	capabilityId: 'ultimabase.http.application',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([application]) => {
		assertHttpApplication(application)
		return application
	},
})
