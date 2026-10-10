import { defineCapability, type CapabilityToken } from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	httpApplicationIdHeader,
	httpMasterKeyHeader,
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

/** Configures one explicit cross-origin browser boundary. */
export interface HttpBrowserPolicyOptions {
	/** Exact serialized origins, or a non-credentialed wildcard. */
	readonly allowedOrigins: '*' | readonly string[]
	/** Methods accepted by browser preflight. */
	readonly allowedMethods: readonly HttpMethod[]
	/** Request header names accepted by browser preflight. */
	readonly allowedHeaders: readonly string[]
	/** Allows browser credentials for exact origins only. */
	readonly credentials: boolean
	/** Browser preflight cache lifetime in seconds. */
	readonly maxAgeSeconds: number
}

/** Disables all UltimaBase-owned CORS behavior. */
export interface DisabledHttpBrowserPolicy {
	readonly enabled: false
}

/** Represents one validated immutable CORS policy. */
export interface EnabledHttpBrowserPolicy extends HttpBrowserPolicyOptions {
	readonly enabled: true
}

/** Describes the complete browser-origin behavior of one HTTP application. */
export type HttpBrowserPolicy =
	DisabledHttpBrowserPolicy | EnabledHttpBrowserPolicy

const headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u
const corsResponseHeaderNames = [
	'Access-Control-Allow-Credentials',
	'Access-Control-Allow-Headers',
	'Access-Control-Allow-Methods',
	'Access-Control-Allow-Origin',
	'Access-Control-Expose-Headers',
	'Access-Control-Max-Age',
] as const
const appIdHeader = httpApplicationIdHeader.toLowerCase()
const wildcardCredentialHeaders = new Set([
	'authorization',
	'cookie',
	httpMasterKeyHeader.toLowerCase(),
])

const disabledPolicy: DisabledHttpBrowserPolicy = immutableRecord({
	enabled: false as const,
})

// Snapshots one non-empty list, rejecting invalid items and duplicate keys.
const snapshotList = <TItem extends string>(
	value: unknown,
	field: 'allowedHeaders' | 'allowedMethods' | 'allowedOrigins',
	messages: readonly [notList: string, invalidItem: string],
	isValid: (item: unknown) => item is TItem,
	key: (item: TItem) => string,
): readonly TItem[] => {
	if (!isUnknownArray(value) || value.length === 0) {
		throw new TypeError(`HTTP browser policy ${field} ${messages[0]}`)
	}
	const items: TItem[] = []
	const keys = new Set<string>()
	for (const item of value) {
		if (!isValid(item)) {
			throw new TypeError(`HTTP browser policy ${field} ${messages[1]}`)
		}
		if (keys.has(key(item))) {
			throw new TypeError(
				`HTTP browser policy ${field} must not contain duplicates`,
			)
		}
		keys.add(key(item))
		items.push(item)
	}
	return immutableArray(items)
}

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

const identity = (value: string): string => value
const lowerCase = (value: string): string => value.toLowerCase()

/** @internal Validates and snapshots browser policy before plugin effects. */
export const normalizeHttpBrowserPolicy = (
	value: unknown,
	masterEnabled: boolean,
): HttpBrowserPolicy => {
	if (value === undefined) return disabledPolicy
	assertExactOptions(
		value,
		[
			'allowedHeaders',
			'allowedMethods',
			'allowedOrigins',
			'credentials',
			'maxAgeSeconds',
		],
		'HTTP browser policy',
	)
	const allowedOrigins =
		value.allowedOrigins === '*'
			? '*'
			: snapshotList(
					value.allowedOrigins,
					'allowedOrigins',
					['must be * or a non-empty array', 'must contain serialized origins'],
					isSerializedOrigin,
					identity,
				)
	const allowedMethods = snapshotList(
		value.allowedMethods,
		'allowedMethods',
		['must be a non-empty array', 'contains an unsupported method'],
		isHttpMethod,
		identity,
	)
	const allowedHeaders = snapshotList(
		value.allowedHeaders,
		'allowedHeaders',
		['must be a non-empty array', 'must contain HTTP header names'],
		isHeaderName,
		lowerCase,
	)
	// Every real browser request must still identify its application.
	if (!allowedHeaders.some((header) => lowerCase(header) === appIdHeader)) {
		throw new TypeError(
			`HTTP browser policy allowedHeaders must include ${httpApplicationIdHeader}`,
		)
	}
	if (typeof value.credentials !== 'boolean') {
		throw new TypeError('HTTP browser policy credentials must be a boolean')
	}
	if (
		typeof value.maxAgeSeconds !== 'number' ||
		!Number.isSafeInteger(value.maxAgeSeconds) ||
		value.maxAgeSeconds < 0
	) {
		throw new TypeError(
			'HTTP browser policy maxAgeSeconds must be a non-negative safe integer',
		)
	}
	if (
		allowedOrigins === '*' &&
		(value.credentials ||
			masterEnabled ||
			allowedHeaders.some((header) =>
				wildcardCredentialHeaders.has(lowerCase(header)),
			))
	) {
		throw new TypeError(
			'HTTP browser policy wildcard origins cannot be combined with credentials, cookies, Authorization, or Master transport',
		)
	}
	return immutableRecord({
		allowedHeaders,
		allowedMethods,
		allowedOrigins,
		credentials: value.credentials,
		enabled: true as const,
		maxAgeSeconds: value.maxAgeSeconds,
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
): boolean =>
	policy.allowedOrigins === '*' || policy.allowedOrigins.includes(origin)

const applyAllowedOrigin = (
	headers: Headers,
	policy: EnabledHttpBrowserPolicy,
	origin: string,
): void => {
	headers.set(
		'Access-Control-Allow-Origin',
		policy.allowedOrigins === '*' ? '*' : origin,
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

/**
 * Enforces one server-owned browser policy before application identity validation and
 * decorates only responses whose origin is explicitly accepted.
 */
export const dispatchHttpBrowserRequest = async (
	policy: HttpBrowserPolicy,
	input: HttpServerRequest,
	next: () => Promise<Response>,
): Promise<Response> => {
	if (!policy.enabled) return next()

	const prepared = prepareHttpServerRequestOrReject(input)
	if (prepared instanceof Response) return prepared
	const header = (name: string): string | undefined =>
		readPreparedHeader(prepared.originalHeaders, name)
	const origin = header('Origin')
	if (origin === undefined) return next()

	const requestedMethod = header('Access-Control-Request-Method')
	if (
		prepared.input.request.method === 'OPTIONS' &&
		requestedMethod !== undefined
	) {
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
		(policy.allowedOrigins !== '*' ||
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
		(policy.allowedOrigins !== '*' && !Array.isArray(policy.allowedOrigins)) ||
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
