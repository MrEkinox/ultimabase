import { defineCapability, type CapabilityToken } from '@ultimabase/core/plugin'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

import type {
	EnabledHttpBrowserPolicy,
	HttpBrowserPolicy,
} from './browser-policy-options.js'
import { httpMasterKeyHeader, isHttpMethod } from './constants.js'
export {
	deriveHttpBrowserPolicy,
	normalizeHttpBrowserOptions,
	type DisabledHttpBrowserPolicy,
	type EnabledHttpBrowserPolicy,
	type HttpBrowserPolicy,
	type HttpBrowserPolicyOptions,
	type NormalizedHttpBrowserOptions,
} from './browser-policy-options.js'
import {
	createHttpPreDispatchErrorResponse,
	httpPreDispatchErrorCodes,
	prepareHttpServerRequestOrReject,
	readPreparedHeader,
	type HttpServerRequest,
} from './request-boundary.js'

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
const isHeaderName = (value: unknown): value is string =>
	typeof value === 'string' && headerNamePattern.test(value)

const lowerCase = (value: string): string => value.toLowerCase()

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
