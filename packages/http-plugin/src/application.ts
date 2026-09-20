import {
	type AnonymousRequestAccess,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type CapabilityProviderContribution,
	type MasterRequestAccess,
	type PluginIdentity,
	type RequestContext,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import {
	httpApplicationProtocolVersion,
	httpMasterKeyHeader,
	httpOriginalHeaderMode,
} from './constants.js'
import {
	compileHttpContextResolvers,
	resolveHttpContext,
	type HttpContextResolverContributionsCapability,
} from './context.js'
import type { HttpBrowserPolicy } from './browser-policy.js'
import { prepareHttpApplicationRequest } from './application-request.js'
import type { HttpEndpointContributionsCapability } from './endpoints.js'
import {
	HttpPreDispatchFailure,
	createHttpPreDispatchErrorResponse,
	createHttpRequestId,
	finalizeHttpResponse,
	httpPreDispatchErrorCodes,
	prepareHttpServerRequest,
	readPreparedHeader,
	withoutHttpCredentialHeaders,
	type HttpOriginalHeader,
	type HttpServerRequest,
	type PreparedHttpServerRequest,
} from './request-boundary.js'
import {
	compileHttpRouteGraph,
	selectHttpEndpoint,
	type HttpRouteGraph,
	type OwnedHttpEndpoint,
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
	disposed: boolean
	readonly masterEnabled: boolean
	readonly owner: PluginIdentity
	requestExecution: ApplicationRequestExecutor | undefined
	readonly requestTimeoutMs: number | undefined
}

const httpApplicationStates = new WeakMap<
	HttpApplication,
	HttpApplicationState
>()
interface HttpRequestSignals {
	readonly deadline: AbortSignal | undefined
	readonly signal: AbortSignal
}

const createRequestSignals = (
	request: Request,
	requestTimeoutMs: number | undefined,
): HttpRequestSignals => {
	if (requestTimeoutMs === undefined) {
		return { deadline: undefined, signal: request.signal }
	}
	const deadline = AbortSignal.timeout(requestTimeoutMs)
	return {
		deadline,
		signal: AbortSignal.any([request.signal, deadline]),
	}
}

const respondToContextFailure = (
	request: Request,
	deadline: AbortSignal | undefined,
	requestId: string,
	fallbackCode:
		| typeof httpPreDispatchErrorCodes.applicationRejected
		| typeof httpPreDispatchErrorCodes.internalError,
): Response => {
	if (deadline?.aborted === true) {
		return createHttpPreDispatchErrorResponse(
			httpPreDispatchErrorCodes.requestTimeout,
			requestId,
		)
	}
	if (request.signal.aborted) {
		throw request.signal.reason
	}
	return createHttpPreDispatchErrorResponse(fallbackCode, requestId)
}

const createAnonymousHttpContext = <TSource extends string>(
	source: TSource,
	requestId: string,
	signal: AbortSignal,
	state: HttpApplicationState,
): RequestContext<AnonymousRequestAccess, TSource> => {
	const requestExecution = state.requestExecution
	if (requestExecution === undefined) {
		throw new TypeError('HTTP application request execution is unavailable')
	}
	return state.callbacks.runPlugin(state.owner, () =>
		requestExecution.createAnonymousContext({ requestId, signal, source }),
	)
}

const resolveApplicationContext = async <TSource extends string>(
	initial: RequestContext<AnonymousRequestAccess, TSource>,
	resolverRequest: Request,
	masterKey: string | undefined,
	state: HttpApplicationState,
): Promise<
	RequestContext<AnonymousRequestAccess | MasterRequestAccess, TSource>
> => {
	const requestExecution = state.requestExecution
	if (requestExecution === undefined) {
		throw new TypeError('HTTP application request execution is unavailable')
	}
	const resolved = await resolveHttpContext(
		initial,
		resolverRequest,
		state.browserPolicy,
		state.contextResolvers,
		requestExecution,
		state.callbacks,
	)
	if (masterKey === undefined) return resolved
	return state.callbacks.runPlugin(state.owner, () =>
		requestExecution.verifyMasterKey({
			context: resolved,
			rawKey: masterKey,
			reason: 'HTTP Master key verification',
		}),
	)
}

const invokeSelectedEndpoint = async (
	endpoint: OwnedHttpEndpoint,
	request: Request,
	context: RequestContext,
	state: HttpApplicationState,
): Promise<Response> => {
	const requestExecution = state.requestExecution
	if (requestExecution === undefined) {
		throw new TypeError('HTTP application request execution is unavailable')
	}
	return state.callbacks.runPlugin(endpoint.provenance.owner, () =>
		requestExecution.runWithContext(context, () => endpoint.handle(request)),
	)
}

const dispatchPreparedRequest = async (
	application: HttpApplication,
	prepared: PreparedHttpServerRequest,
): Promise<Response> => {
	const state = httpApplicationStates.get(application)
	if (state === undefined || state.disposed) {
		return createHttpPreDispatchErrorResponse(
			httpPreDispatchErrorCodes.internalError,
			prepared.requestId,
		)
	}

	try {
		prepared = prepareHttpApplicationRequest(application, prepared)
	} catch {
		return createHttpPreDispatchErrorResponse(
			httpPreDispatchErrorCodes.applicationRejected,
			prepared.requestId,
		)
	}

	const endpoint = selectHttpEndpoint(
		application.routeGraph,
		prepared.input.request,
	)
	if (endpoint === undefined) {
		return createHttpPreDispatchErrorResponse(
			httpPreDispatchErrorCodes.notFound,
			prepared.requestId,
		)
	}
	const masterKey = readPreparedHeader(
		prepared.originalHeaders,
		httpMasterKeyHeader,
	)
	if (masterKey !== undefined && !state.masterEnabled) {
		return createHttpPreDispatchErrorResponse(
			httpPreDispatchErrorCodes.applicationRejected,
			prepared.requestId,
		)
	}

	const signals = createRequestSignals(
		prepared.input.request,
		state.requestTimeoutMs,
	)
	const resolverRequest = withoutHttpCredentialHeaders(
		prepared.input.request,
		[httpMasterKeyHeader],
		signals.signal,
	)
	let anonymous: RequestContext<AnonymousRequestAccess>
	try {
		anonymous = createAnonymousHttpContext(
			endpoint.protocol.name,
			prepared.requestId,
			signals.signal,
			state,
		)
	} catch {
		return respondToContextFailure(
			prepared.input.request,
			signals.deadline,
			prepared.requestId,
			httpPreDispatchErrorCodes.internalError,
		)
	}

	let context: RequestContext<AnonymousRequestAccess | MasterRequestAccess>
	try {
		context = await resolveApplicationContext(
			anonymous,
			resolverRequest,
			masterKey,
			state,
		)
	} catch {
		return respondToContextFailure(
			prepared.input.request,
			signals.deadline,
			prepared.requestId,
			httpPreDispatchErrorCodes.applicationRejected,
		)
	}

	const handlerRequest = withoutHttpCredentialHeaders(
		resolverRequest,
		['Authorization', 'Cookie'],
		signals.signal,
	)
	try {
		const response = await invokeSelectedEndpoint(
			endpoint,
			handlerRequest,
			context,
			state,
		)
		if (signals.deadline?.aborted === true) {
			return createHttpPreDispatchErrorResponse(
				httpPreDispatchErrorCodes.requestTimeout,
				prepared.requestId,
			)
		}
		return finalizeHttpResponse(response, prepared.requestId)
	} catch (error: unknown) {
		if (signals.deadline?.aborted === true) {
			return createHttpPreDispatchErrorResponse(
				httpPreDispatchErrorCodes.requestTimeout,
				prepared.requestId,
			)
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
	const contextResolvers = compileHttpContextResolvers(
		options.contextContributions,
		options.browserPolicy,
		options.callbacks,
	)
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
			const fallbackRequestId = createHttpRequestId()
			let prepared: PreparedHttpServerRequest
			try {
				prepared = prepareHttpServerRequest(input)
			} catch (error: unknown) {
				const code =
					error instanceof HttpPreDispatchFailure
						? error.code
						: httpPreDispatchErrorCodes.internalError
				return createHttpPreDispatchErrorResponse(code, fallbackRequestId)
			}
			return dispatchPreparedRequest(application, prepared)
		},
	})
	httpApplicationStates.set(application, {
		browserPolicy: options.browserPolicy,
		callbacks: options.callbacks,
		contextResolvers,
		disposed: false,
		masterEnabled: options.masterEnabled,
		owner: immutableRecord(options.owner),
		requestExecution: options.requestExecution,
		requestTimeoutMs: options.requestTimeoutMs,
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
