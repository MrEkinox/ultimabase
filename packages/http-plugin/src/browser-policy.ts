import { defineCapability, type CapabilityToken } from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	httpApplicationIdHeader,
	httpMasterKeyHeader,
	httpRequestIdHeader,
	isHttpMethod,
} from './constants.js'
import { assertExactOptions } from './definitions.js'
import type { HttpMethod } from './endpoints.js'
import {
	createHttpPreDispatchErrorResponse,
	httpPreDispatchErrorCodes,
	prepareHttpServerRequestOrReject,
	readPreparedHeader,
	type HttpServerRequest,
} from './request-boundary.js'

/**
 * Lets browser pages on other origins call the application (CORS). Allowed
 * methods come from the mounted routes and allowed headers from the installed
 * plugins (ADR-0323).
 * @example `{ origins: ['https://app.example.com'], credentials: true }`
 */
export interface HttpBrowserPolicyOptions {
	/** Exact serialized origins, or `'*'` for any origin without credentials. */
	readonly origins: '*' | readonly string[]
	/** Lets browsers send cookies, for exact origins only. @default false */
	readonly credentials?: boolean
	/** Browser preflight cache lifetime in seconds. @default 600 */
	readonly maxAgeSeconds?: number
}

/** Disables all UltimaBase-owned CORS behavior. */
export interface DisabledHttpBrowserPolicy {
	readonly enabled: false
}

/** Represents one validated immutable CORS policy and its derived lists. */
export interface EnabledHttpBrowserPolicy {
	readonly enabled: true
	readonly origins: '*' | readonly string[]
	readonly credentials: boolean
	/** Methods of the mounted routes; every method when a mount exists. */
	readonly allowedMethods: readonly HttpMethod[]
	/** Headers the installed plugins read from browser requests. */
	readonly allowedHeaders: readonly string[]
	readonly maxAgeSeconds: number
}

/** Describes the complete browser-origin behavior of one HTTP application. */
export type HttpBrowserPolicy =
	DisabledHttpBrowserPolicy | EnabledHttpBrowserPolicy

/** @internal The validated `browser` option, before derivation from routes. */
export interface NormalizedHttpBrowserOptions {
	readonly credentials: boolean
	readonly maxAgeSeconds: number
	readonly origins: '*' | readonly string[]
}

const headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u
const corsResponseHeaderNames = [
	'Access-Control-Allow-Credentials',
	'Access-Control-Allow-Headers',
	'Access-Control-Allow-Methods',
	'Access-Control-Allow-Origin',
	'Access-Control-Expose-Headers',
	'Access-Control-Max-Age',
] as const
const wildcardCredentialHeaders = new Set([
	'authorization',
	'cookie',
	httpMasterKeyHeader.toLowerCase(),
])
// Every method a mount may answer, in the order emitted to browsers.
const mountMethods: readonly HttpMethod[] = [
	'GET',
	'HEAD',
	'POST',
	'PUT',
	'PATCH',
	'DELETE',
]

const disabledPolicy: DisabledHttpBrowserPolicy = immutableRecord({
	enabled: false as const,
})

const isHeaderName = (value: unknown): value is string =>
	typeof value === 'string' && headerNamePattern.test(value)

// Only an exact serialized, non-opaque origin compares equal to Origin headers.
const isSerializedOrigin = (value: unknown): value is string => {
	if (typeof value !== 'string') return false
	try {
		const { origin } = new URL(value)
		return origin === value && origin !== 'null'
	} catch {
		return false
	}
}

const lowerCase = (value: string): string => value.toLowerCase()

const normalizeOrigins = (value: unknown): '*' | readonly string[] => {
	if (value === '*') return '*'
	if (!isUnknownArray(value) || value.length === 0) {
		throw new TypeError(
			'HTTP browser policy origins must be * or a non-empty array',
		)
	}
	const origins: string[] = []
	for (const origin of value) {
		if (!isSerializedOrigin(origin)) {
			throw new TypeError(
				`HTTP browser policy origins must contain serialized origins such as https://app.example.com, got ${JSON.stringify(origin)}`,
			)
		}
		if (origins.includes(origin)) {
			throw new TypeError(
				'HTTP browser policy origins must not contain duplicates',
			)
		}
		origins.push(origin)
	}
	return immutableArray(origins)
}

/** @internal Validates and snapshots the `browser` option before plugin effects. */
export const normalizeHttpBrowserOptions = (
	value: unknown,
	masterEnabled: boolean,
): NormalizedHttpBrowserOptions | undefined => {
	if (value === undefined) return undefined
	assertExactOptions(
		value,
		['credentials', 'maxAgeSeconds', 'origins'],
		'HTTP browser policy',
	)
	const origins = normalizeOrigins(value.origins)
	const credentials = value.credentials ?? false
	if (typeof credentials !== 'boolean') {
		throw new TypeError('HTTP browser policy credentials must be a boolean')
	}
	const maxAgeSeconds = value.maxAgeSeconds ?? 600
	if (
		typeof maxAgeSeconds !== 'number' ||
		!Number.isSafeInteger(maxAgeSeconds) ||
		maxAgeSeconds < 0
	) {
		throw new TypeError(
			'HTTP browser policy maxAgeSeconds must be a non-negative safe integer',
		)
	}
	if (origins === '*' && (credentials || masterEnabled)) {
		throw new TypeError(
			'HTTP browser policy wildcard origins cannot be combined with credentials, cookies, Authorization, or Master transport',
		)
	}
	return immutableRecord({ credentials, maxAgeSeconds, origins })
}

/**
 * @internal Derives the effective policy: methods from the mounted endpoints,
 * headers from what the installed plugins read. A wildcard origin never allows
 * credential headers.
 */
export const deriveHttpBrowserPolicy = (
	options: NormalizedHttpBrowserOptions | undefined,
	derivation: Readonly<{
		readonly credentialResolvers: boolean
		readonly endpoints: readonly (
			| Readonly<{ readonly kind: 'mount' }>
			| Readonly<{
					readonly kind: 'browser-bootstrap' | 'route'
					readonly method: HttpMethod
			  }>
		)[]
		readonly masterEnabled: boolean
	}>,
): HttpBrowserPolicy => {
	if (options === undefined) return disabledPolicy
	const methods = new Set<HttpMethod>()
	for (const endpoint of derivation.endpoints) {
		if (endpoint.kind === 'mount') {
			for (const method of mountMethods) methods.add(method)
		} else methods.add(endpoint.method)
	}
	const allowedHeaders = [
		'Content-Type',
		httpApplicationIdHeader,
		httpRequestIdHeader,
		...(derivation.credentialResolvers && options.origins !== '*'
			? ['Authorization']
			: []),
		...(derivation.masterEnabled ? [httpMasterKeyHeader] : []),
	]
	return immutableRecord({
		allowedHeaders: immutableArray(allowedHeaders),
		allowedMethods: immutableArray(
			[...mountMethods, 'OPTIONS' as const].filter((method) =>
				methods.has(method),
			),
		),
		credentials: options.credentials,
		enabled: true as const,
		maxAgeSeconds: options.maxAgeSeconds,
		origins: options.origins,
	})
}

const addVary = (headers: Headers, names: readonly string[]): void => {
	const values = (headers.get('Vary') ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0)
	const normalized = new Set(values.map((value) => value.toLowerCase()))
	for (const name of names) {
		if (!normalized.has(name.toLowerCase())) values.push(name)
	}
	headers.set('Vary', values.join(', '))
}

const isAllowedOrigin = (
	policy: EnabledHttpBrowserPolicy,
	origin: string,
): boolean => policy.origins === '*' || policy.origins.includes(origin)

const applyAllowedOrigin = (
	headers: Headers,
	policy: EnabledHttpBrowserPolicy,
	origin: string,
): void => {
	headers.set(
		'Access-Control-Allow-Origin',
		policy.origins === '*' ? '*' : origin,
	)
	if (policy.credentials) {
		headers.set('Access-Control-Allow-Credentials', 'true')
	}
}

// An empty list is valid; any malformed name rejects the whole preflight.
const parseRequestedHeaders = (
	value: string | undefined,
): readonly string[] | undefined => {
	if (value === undefined || value.trim().length === 0) return []
	const headers = value.split(',').map((header) => header.trim())
	return headers.every(isHeaderName) ? headers : undefined
}

// Reads untrusted provider input defensively: a malformed one is not a preflight.
const isPreflight = (input: HttpServerRequest): boolean => {
	const untrusted: unknown = input
	if (!isPlainRecord(untrusted) || !(untrusted.request instanceof Request)) {
		return false
	}
	const headers: unknown = untrusted.originalHeaders
	const has = (name: string): boolean =>
		isUnknownArray(headers) &&
		headers.some(
			(header) =>
				isUnknownArray(header) &&
				typeof header[0] === 'string' &&
				header[0].toLowerCase() === name,
		)
	return (
		untrusted.request.method === 'OPTIONS' &&
		has('origin') &&
		has('access-control-request-method')
	)
}

/**
 * Enforces one server-owned browser policy before application identity validation and
 * decorates only responses whose origin is explicitly accepted.
 */
export const dispatchHttpBrowserRequest = async (
	policy: HttpBrowserPolicy,
	input: HttpServerRequest,
	next: () => Promise<Response>,
): Promise<Response> => {
	if (!policy.enabled) {
		// Disabled CORS forwards everything except a preflight, which learns
		// how to enable it (ADR-0323); the application validates the rest.
		if (!isPreflight(input)) return next()
		const prepared = prepareHttpServerRequestOrReject(input)
		return prepared instanceof Response
			? prepared
			: createHttpPreDispatchErrorResponse(
					httpPreDispatchErrorCodes.corsDisabled,
					prepared.requestId,
				)
	}
	const prepared = prepareHttpServerRequestOrReject(input)
	if (prepared instanceof Response) return prepared
	const header = (name: string): string | undefined =>
		readPreparedHeader(prepared.originalHeaders, name)
	const origin = header('Origin')
	if (origin === undefined) return next()
	const requestedMethod = header('Access-Control-Request-Method')
	const preflight =
		prepared.input.request.method === 'OPTIONS' && requestedMethod !== undefined

	if (preflight) {
		// A preflight is answered here and never reaches application behavior.
		const requestedHeaders = parseRequestedHeaders(
			header('Access-Control-Request-Headers'),
		)
		if (requestedHeaders === undefined) {
			return createHttpPreDispatchErrorResponse(
				httpPreDispatchErrorCodes.badRequest,
				prepared.requestId,
			)
		}
		const allowedHeaderNames = new Set(policy.allowedHeaders.map(lowerCase))
		const accepted =
			isAllowedOrigin(policy, origin) &&
			isHttpMethod(requestedMethod) &&
			policy.allowedMethods.includes(requestedMethod) &&
			requestedHeaders.every((name) => allowedHeaderNames.has(lowerCase(name)))
		const headers = new Headers()
		addVary(headers, [
			'Origin',
			'Access-Control-Request-Method',
			'Access-Control-Request-Headers',
		])
		if (accepted) {
			applyAllowedOrigin(headers, policy, origin)
			headers.set(
				'Access-Control-Allow-Methods',
				policy.allowedMethods.join(', '),
			)
			headers.set(
				'Access-Control-Allow-Headers',
				policy.allowedHeaders.join(', '),
			)
			headers.set('Access-Control-Max-Age', String(policy.maxAgeSeconds))
		}
		return new Response(null, { headers, status: 204 })
	}

	const response = await next()
	const headers = new Headers(response.headers)
	// One layer must own CORS: a handler emitting it fails safely.
	if (corsResponseHeaderNames.some((name) => headers.has(name))) {
		return createHttpPreDispatchErrorResponse(
			httpPreDispatchErrorCodes.internalError,
			prepared.requestId,
		)
	}
	addVary(headers, ['Origin'])
	// A wildcard never answers a request that carried credentials.
	if (
		isAllowedOrigin(policy, origin) &&
		(policy.origins !== '*' ||
			!prepared.originalHeaders.some(([name]) =>
				wildcardCredentialHeaders.has(lowerCase(name)),
			))
	) {
		applyAllowedOrigin(headers, policy, origin)
	}
	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	})
}

const assertHttpBrowserPolicy: (
	policy: unknown,
) => asserts policy is HttpBrowserPolicy = (policy) => {
	if (!isPlainRecord(policy) || typeof policy.enabled !== 'boolean') {
		throw new TypeError('HTTP browser policy capability is malformed')
	}
	if (!policy.enabled) return
	if (
		(policy.origins !== '*' && !Array.isArray(policy.origins)) ||
		!Array.isArray(policy.allowedMethods) ||
		!Array.isArray(policy.allowedHeaders) ||
		typeof policy.credentials !== 'boolean' ||
		typeof policy.maxAgeSeconds !== 'number'
	) {
		throw new TypeError('HTTP browser policy capability is malformed')
	}
}

/** Carries one application policy to its concrete HTTP server provider. */
export const httpBrowserPolicyCapability: CapabilityToken<
	HttpBrowserPolicy,
	HttpBrowserPolicy,
	'ultimabase.http.browser-policy',
	'1.0.0',
	'single',
	'application'
> = defineCapability<HttpBrowserPolicy>()({
	capabilityId: 'ultimabase.http.browser-policy',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	hint: 'Install @ultimabase/http-plugin and add httpPlugin() to UltimaBase.use(...).',
	compose: ([policy]) => {
		assertHttpBrowserPolicy(policy)
		return policy
	},
})
