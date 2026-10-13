import {
	PublicError,
	type AnonymousRequestAccess,
	type ApplicationRequestExecutor,
	type MasterRequestAccess,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	acceptHttpApplicationRequest,
	lacksNetworkHeaders,
} from './application-identity.js'

import { limitHttpBody } from './body-limit.js'
import { isHttpHealthRoute } from './health.js'
import type { HttpEndpointLimits } from './endpoint-limits.js'

import {
	httpApplicationProtocolVersion,
	httpMasterKeyHeader,
	httpOriginalHeaderMode,
	httpRequestIdHeader,
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
	httpNetworkHeadersMissingMessage,
	httpPreDispatchErrorCodes,
	prepareHttpServerRequestOrReject,
	readPreparedHeader,
	withoutHttpCredentialHeaders,
	type HttpOriginalHeader,
	type HttpPreDispatchErrorCode,
	type HttpServerRequest,
	type PreparedHttpServerRequest,
} from './request-boundary.js'
import {
	HttpRateLimiter,
	httpRateLimitKey,
	isHttpsRequest,
	resolveHttpClientAddress,
	type HttpTrustProxy,
	type NormalizedHttpRateLimit,
} from './rate-limit.js'
import {
	compileHttpRouteGraph,
	selectHttpEndpoint,
	type HttpRouteGraph,
} from './route-graph.js'
import {
	applyHttpSecurityHeaders,
	type NormalizedHttpSecurityHeaders,
} from './security-headers.js'
import type {
	RequestContext,
	ApplicationCallbackExecutor,
	ApplicationCapabilityFactoryContext,
	CapabilityProviderContribution,
	PluginIdentity,
} from '@ultimabase/core/plugin'

type Logger = ApplicationCapabilityFactoryContext['logger']

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
	readonly requestTimeoutMs: number
	/** Resolves one application-bound context before dispatching a Fetch request. */
	fetch(input: HttpServerRequest): Promise<Response>
}

/** @internal Request handling settings fixed when the plugin is created. */
export interface HttpApplicationSettings {
	readonly accessLog: boolean
	readonly appId: string
	readonly bodyLimit: number
	readonly healthPath: string | undefined
	readonly masterEnabled: boolean
	readonly rateLimit: NormalizedHttpRateLimit
	readonly requestTimeoutMs: number
	readonly requireApplicationId: boolean
	readonly securityHeaders: NormalizedHttpSecurityHeaders
	readonly trustProxy: HttpTrustProxy | undefined
}

interface HttpApplicationState {
	readonly browserPolicy: HttpBrowserPolicy
	readonly callbacks: ApplicationCallbackExecutor
	readonly contextResolvers: ReturnType<typeof compileHttpContextResolvers>
	readonly logger: Logger
	readonly owner: PluginIdentity
	readonly rateLimiter: HttpRateLimiter
	readonly settings: HttpApplicationSettings
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

const dispatchPreparedRequest = async (
	application: HttpApplication,
	state: HttpApplicationState,
	prepared: PreparedHttpServerRequest,
): Promise<Response> => {
	const reject = (
		code: HttpPreDispatchErrorCode,
		options?: Parameters<typeof createHttpPreDispatchErrorResponse>[2],
	): Response =>
		createHttpPreDispatchErrorResponse(code, prepared.requestId, options)
	if (state.requestExecution === undefined) {
		return reject(httpPreDispatchErrorCodes.internalError)
	}
	if (lacksNetworkHeaders(prepared)) {
		return reject(httpPreDispatchErrorCodes.badRequest, {
			message: httpNetworkHeadersMissingMessage,
		})
	}

	let accepted: PreparedHttpServerRequest | HttpPreDispatchErrorCode
	try {
		accepted = acceptHttpApplicationRequest(
			application,
			state.settings,
			prepared,
		)
	} catch {
		accepted = httpPreDispatchErrorCodes.applicationRejected
	}
	if (typeof accepted === 'string') return reject(accepted)
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

	// Browser bootstraps are pages: they keep the application-wide limits.
	const limits: HttpEndpointLimits =
		endpoint.kind === 'browser-bootstrap' ? {} : endpoint
	// Without an applicable limit, no store is consulted and nothing awaits.
	// Probes share one address, so the built-in health route is never limited.
	if (
		!isHttpHealthRoute(endpoint, state.settings.healthPath) &&
		state.rateLimiter.applies(limits.rateLimit)
	) {
		let retryAfter: number | undefined
		try {
			retryAfter = await state.rateLimiter.check(
				resolveHttpClientAddress(accepted, state.settings.trustProxy),
				{ key: httpRateLimitKey(endpoint), limit: limits.rateLimit },
			)
		} catch {
			return reject(httpPreDispatchErrorCodes.internalError)
		}
		if (retryAfter !== undefined) {
			return reject(httpPreDispatchErrorCodes.rateLimited, {
				headers: { 'Retry-After': String(retryAfter) },
			})
		}
	}

	// One deadline signal is shared by resolvers, handlers and Runtime work.
	const deadline = AbortSignal.timeout(application.requestTimeoutMs)
	const signal = AbortSignal.any([request.signal, deadline])
	const timedOut = (): boolean => deadline.aborted
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
	const body = limitHttpBody(
		request.body,
		limits.bodyLimit ?? state.settings.bodyLimit,
	)
	const resolverRequest = withoutHttpCredentialHeaders(
		request,
		[httpMasterKeyHeader],
		signal,
		body.body,
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
			resolveHttpClientAddress(accepted, state.settings.trustProxy),
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
		resolverRequest.body,
	)
	try {
		const requestExecution = requireRequestExecution(state)
		const response = await state.callbacks.runPlugin(
			endpoint.provenance.owner,
			() =>
				requestExecution.runWithContext(context, () =>
					endpoint.handle(handlerRequest, immutableRecord({ context })),
				),
		)
		if (timedOut()) return reject(httpPreDispatchErrorCodes.requestTimeout)
		// A transport that answered 413 in its own format keeps its answer.
		if (body.exceeded() && response.status !== 413) {
			return reject(httpPreDispatchErrorCodes.payloadTooLarge)
		}
		return finalizeHttpResponse(response, prepared.requestId)
	} catch (error: unknown) {
		if (timedOut()) return reject(httpPreDispatchErrorCodes.requestTimeout)
		if (body.exceeded())
			return reject(httpPreDispatchErrorCodes.payloadTooLarge)
		if (error instanceof PublicError) {
			return createHttpPublicErrorResponse(error.toJSON(), prepared.requestId)
		}
		throw error
	}
}

// Logs one line per request: never bodies, queries, headers or credentials.
const logAccess = (
	logger: Logger,
	input: HttpServerRequest,
	status: number,
	startedAt: number,
	requestId: string | null,
): void => {
	const request: unknown = isPlainRecord(input) ? input.request : undefined
	const method = request instanceof Request ? request.method : 'UNKNOWN'
	const path = request instanceof Request ? new URL(request.url).pathname : ''
	const durationMs = Math.round(performance.now() - startedAt)
	logger.info(`${method} ${path} ${String(status)} ${String(durationMs)}ms`, {
		durationMs,
		method,
		path,
		requestId,
		status,
	})
}

/** @internal Materializes one application graph while keeping Core execution private. */
export const createHttpApplicationResource = (
	options: Readonly<{
		readonly browserPolicy: HttpBrowserPolicy
		readonly callbacks: ApplicationCallbackExecutor
		readonly contextContributions: readonly CapabilityProviderContribution<HttpContextResolverContributionsCapability>[]
		readonly endpointContributions: readonly CapabilityProviderContribution<HttpEndpointContributionsCapability>[]
		readonly logger: Logger
		readonly owner: PluginIdentity
		readonly requestExecution: ApplicationRequestExecutor
		readonly settings: HttpApplicationSettings
	}>,
): Readonly<{
	readonly value: HttpApplication
	readonly dispose: () => void
}> => {
	const { settings } = options
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
		logger: options.logger,
		owner: immutableRecord(options.owner),
		rateLimiter: new HttpRateLimiter(settings.rateLimit),
		requestExecution: options.requestExecution,
		settings,
	}
	const application: HttpApplication = immutableRecord({
		appId: settings.appId,
		authority: immutableRecord({
			master: immutableRecord({ enabled: settings.masterEnabled }),
		}),
		protocolVersion: httpApplicationProtocolVersion,
		originalHeaderMode: httpOriginalHeaderMode,
		requestTimeoutMs: settings.requestTimeoutMs,
		routeGraph,
		fetch: async (input: HttpServerRequest): Promise<Response> => {
			const startedAt = performance.now()
			let status = 500
			let requestId: string | null = null
			try {
				const prepared = prepareHttpServerRequestOrReject(input)
				const response =
					prepared instanceof Response
						? prepared
						: applyHttpSecurityHeaders(
								await dispatchPreparedRequest(application, state, prepared),
								settings.securityHeaders,
								isHttpsRequest(prepared, settings.trustProxy),
							)
				status = response.status
				requestId = response.headers.get(httpRequestIdHeader)
				return response
			} finally {
				if (settings.accessLog) {
					logAccess(state.logger, input, status, startedAt, requestId)
				}
			}
		},
	})

	return immutableRecord({
		value: application,
		dispose: () => {
			state.requestExecution = undefined
		},
	})
}
