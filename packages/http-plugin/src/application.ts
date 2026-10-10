import {
	PublicError,
	type AnonymousRequestAccess,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type CapabilityProviderContribution,
	type MasterRequestAccess,
	type PluginIdentity,
	type RequestContext,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	httpApplicationIdHeader,
	httpApplicationProtocolVersion,
	httpBrowserBootstrapPathPrefix,
	httpMasterKeyHeader,
	httpOriginalHeaderMode,
} from './constants.js'
import {
	compileHttpContextResolvers,
	resolveHttpContext,
	type HttpContextResolverContributionsCapability,
} from './context.js'
import type { HttpBrowserPolicy } from './browser-policy.js'
import type { HttpEndpointContributionsCapability } from './endpoints.js'
import {
	createHttpPreDispatchErrorResponse,
	createHttpPublicErrorResponse,
	finalizeHttpResponse,
	httpPreDispatchErrorCodes,
	prepareHttpServerRequestOrReject,
	readPreparedHeader,
	rebuildHttpRequest,
	withoutHttpCredentialHeaders,
	type HttpOriginalHeader,
	type HttpPreDispatchErrorCode,
	type HttpServerRequest,
	type PreparedHttpServerRequest,
} from './request-boundary.js'
import {
	compileHttpRouteGraph,
	selectHttpEndpoint,
	type HttpRouteGraph,
} from './route-graph.js'

export { httpApplicationCapability } from './application-capability.js'

export type { HttpOriginalHeader, HttpServerRequest }
export type {
	HttpEndpointProvenance,
	HttpRouteGraph,
	OwnedHttpEndpoint,
	OwnedHttpBrowserBootstrapRoute,
	OwnedHttpMount,
	OwnedHttpRoute,
} from './route-graph.js'

/** Distinguishes the provider's listener ownership from application identity. */
export type HttpServerOwnership = 'external' | 'framework'

/** Reports immutable application-owned HTTP authority configuration. */
export interface HttpApplicationAuthority {
	readonly master: Readonly<{ readonly enabled: boolean }>
}

/** Names the immutable application graph consumed by an HTTP server provider. */
export interface HttpApplication {
	readonly appId: string
	readonly protocolVersion: typeof httpApplicationProtocolVersion
	readonly originalHeaderMode: typeof httpOriginalHeaderMode
	readonly routeGraph: HttpRouteGraph
	readonly authority: HttpApplicationAuthority
	readonly requestTimeoutMs: number | undefined
	/** Resolves one application-bound context before dispatching a Fetch request. */
	fetch(input: HttpServerRequest): Promise<Response>
}

interface HttpApplicationState {
	readonly browserPolicy: HttpBrowserPolicy
	readonly callbacks: ApplicationCallbackExecutor
	readonly contextResolvers: ReturnType<typeof compileHttpContextResolvers>
	readonly owner: PluginIdentity
	requestExecution: ApplicationRequestExecutor | undefined
}

// Disposal can happen while a request awaits, so every Core entry re-checks it.
const requireRequestExecution = (
	state: HttpApplicationState,
): ApplicationRequestExecutor => {
	if (state.requestExecution === undefined) {
		throw new TypeError('HTTP application request execution is unavailable')
	}
	return state.requestExecution
}

// Reads `/__ultimabase/apps/{encoded appId}{routePath}` from one GET request.
const readBrowserBootstrapSelection = (
	request: Request,
): Readonly<{ appId: string; routePath: string }> | undefined => {
	if (request.method !== 'GET') return undefined
	const pathname = new URL(request.url).pathname
	const prefix = `${httpBrowserBootstrapPathPrefix}/`
	if (!pathname.startsWith(prefix)) return undefined

	const remainder = pathname.slice(prefix.length)
	const separator = remainder.indexOf('/')
	if (separator < 1) return undefined

	let appId: string
	try {
		appId = decodeURIComponent(remainder.slice(0, separator))
	} catch {
		return undefined
	}
	if (appId.length === 0) return undefined
	return { appId, routePath: remainder.slice(separator) }
}

/**
 * Accepts the exact header identity, or path identity only for an exact owned
 * browser bootstrap, which is rewritten into an ordinary identified request.
 * An explicit header never falls back to the path, even when empty.
 */
const acceptApplicationRequest = (
	application: HttpApplication,
	prepared: PreparedHttpServerRequest,
): PreparedHttpServerRequest | undefined => {
	const appId = readPreparedHeader(
		prepared.originalHeaders,
		httpApplicationIdHeader,
	)
	if (appId !== undefined) {
		return appId.length > 0 && appId === application.appId
			? prepared
			: undefined
	}
	const source = prepared.input.request
	const selection = readBrowserBootstrapSelection(source)
	if (
		selection?.appId !== application.appId ||
		!application.routeGraph.browserBootstraps.some(
			(route) => route.path === selection.routePath,
		)
	)
		return undefined

	const originalHeaders = immutableArray([
		...prepared.originalHeaders,
		immutableArray([httpApplicationIdHeader, selection.appId] as const),
	])
	const url = new URL(source.url)
	url.pathname = selection.routePath
	const headers = new Headers(source.headers)
	headers.set(httpApplicationIdHeader, selection.appId)
	const request = rebuildHttpRequest(source, url, headers, source.signal, null)
	return immutableRecord({
		input: immutableRecord({ originalHeaders, request }),
		originalHeaders,
		requestId: prepared.requestId,
	})
}

const dispatchPreparedRequest = async (
	application: HttpApplication,
	state: HttpApplicationState,
	prepared: PreparedHttpServerRequest,
): Promise<Response> => {
	const reject = (code: HttpPreDispatchErrorCode): Response =>
		createHttpPreDispatchErrorResponse(code, prepared.requestId)
	if (state.requestExecution === undefined) {
		return reject(httpPreDispatchErrorCodes.internalError)
	}

	let accepted: PreparedHttpServerRequest | undefined
	try {
		accepted = acceptApplicationRequest(application, prepared)
	} catch {
		accepted = undefined
	}
	if (accepted === undefined) {
		return reject(httpPreDispatchErrorCodes.applicationRejected)
	}
	const request = accepted.input.request
	const endpoint = selectHttpEndpoint(application.routeGraph, request)
	if (endpoint === undefined) return reject(httpPreDispatchErrorCodes.notFound)
	const masterKey = readPreparedHeader(
		accepted.originalHeaders,
		httpMasterKeyHeader,
	)
	if (masterKey !== undefined && !application.authority.master.enabled) {
		return reject(httpPreDispatchErrorCodes.applicationRejected)
	}

	// One deadline signal is shared by resolvers, handlers and Runtime work.
	const deadline =
		application.requestTimeoutMs === undefined
			? undefined
			: AbortSignal.timeout(application.requestTimeoutMs)
	const signal =
		deadline === undefined
			? request.signal
			: AbortSignal.any([request.signal, deadline])
	const timedOut = (): boolean => deadline?.aborted === true
	// Context failures stay sanitized, but a client abort keeps its own reason.
	const contextFailure = (
		fallback:
			| typeof httpPreDispatchErrorCodes.applicationRejected
			| typeof httpPreDispatchErrorCodes.internalError,
	): Response => {
		if (timedOut()) return reject(httpPreDispatchErrorCodes.requestTimeout)
		if (request.signal.aborted) throw request.signal.reason
		return reject(fallback)
	}
	const resolverRequest = withoutHttpCredentialHeaders(
		request,
		[httpMasterKeyHeader],
		signal,
	)

	let anonymous: RequestContext<AnonymousRequestAccess>
	try {
		const requestExecution = requireRequestExecution(state)
		anonymous = state.callbacks.runPlugin(state.owner, () =>
			requestExecution.createAnonymousContext({
				requestId: prepared.requestId,
				signal,
				source: endpoint.protocol.name,
			}),
		)
	} catch {
		return contextFailure(httpPreDispatchErrorCodes.internalError)
	}

	let context: RequestContext<AnonymousRequestAccess | MasterRequestAccess>
	try {
		const requestExecution = requireRequestExecution(state)
		const resolved = await resolveHttpContext(
			anonymous,
			resolverRequest,
			state.browserPolicy,
			state.contextResolvers,
			requestExecution,
			state.callbacks,
		)
		// Master verification runs last so it keeps the resolvers' safe values.
		context =
			masterKey === undefined
				? resolved
				: await state.callbacks.runPlugin(state.owner, () =>
						requestExecution.verifyMasterKey({
							context: resolved,
							rawKey: masterKey,
							reason: 'HTTP Master key verification',
						}),
					)
	} catch {
		return contextFailure(httpPreDispatchErrorCodes.applicationRejected)
	}

	const handlerRequest = withoutHttpCredentialHeaders(
		resolverRequest,
		['Authorization', 'Cookie'],
		signal,
	)
	try {
		const requestExecution = requireRequestExecution(state)
		const response = await state.callbacks.runPlugin(
			endpoint.provenance.owner,
			() =>
				requestExecution.runWithContext(context, () =>
					endpoint.handle(handlerRequest),
				),
		)
		return timedOut()
			? reject(httpPreDispatchErrorCodes.requestTimeout)
			: finalizeHttpResponse(response, prepared.requestId)
	} catch (error: unknown) {
		if (timedOut()) return reject(httpPreDispatchErrorCodes.requestTimeout)
		if (error instanceof PublicError) {
			return createHttpPublicErrorResponse(error.toJSON(), prepared.requestId)
		}
		throw error
	}
}

/** @internal Materializes one application graph while keeping Core execution private. */
export const createHttpApplicationResource = (
	options: Readonly<{
		readonly appId: string
		readonly browserPolicy: HttpBrowserPolicy
		readonly callbacks: ApplicationCallbackExecutor
		readonly contextContributions: readonly CapabilityProviderContribution<HttpContextResolverContributionsCapability>[]
		readonly endpointContributions: readonly CapabilityProviderContribution<HttpEndpointContributionsCapability>[]
		readonly masterEnabled: boolean
		readonly owner: PluginIdentity
		readonly requestExecution: ApplicationRequestExecutor
		readonly requestTimeoutMs: number | undefined
	}>,
): Readonly<{
	readonly value: HttpApplication
	readonly dispose: () => void
}> => {
	const routeGraph = compileHttpRouteGraph(
		options.endpointContributions,
		options.callbacks,
	)
	// Fetch and disposal share this resource's state without an application lookup table.
	const state: HttpApplicationState = {
		browserPolicy: options.browserPolicy,
		callbacks: options.callbacks,
		contextResolvers: compileHttpContextResolvers(
			options.contextContributions,
			options.browserPolicy,
			options.callbacks,
		),
		owner: immutableRecord(options.owner),
		requestExecution: options.requestExecution,
	}
	const application: HttpApplication = immutableRecord({
		appId: options.appId,
		authority: immutableRecord({
			master: immutableRecord({ enabled: options.masterEnabled }),
		}),
		protocolVersion: httpApplicationProtocolVersion,
		originalHeaderMode: httpOriginalHeaderMode,
		requestTimeoutMs: options.requestTimeoutMs,
		routeGraph,
		fetch: async (input: HttpServerRequest): Promise<Response> => {
			const prepared = prepareHttpServerRequestOrReject(input)
			return prepared instanceof Response
				? prepared
				: dispatchPreparedRequest(application, state, prepared)
		},
	})

	return immutableRecord({
		value: application,
		dispose: () => {
			state.requestExecution = undefined
		},
	})
}
