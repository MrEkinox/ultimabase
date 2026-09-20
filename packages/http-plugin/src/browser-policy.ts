import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { httpApplicationIdHeader, httpMasterKeyHeader } from './constants.js'
import type { HttpMethod } from './endpoints.js'
import {
	HttpPreDispatchFailure,
	createHttpPreDispatchErrorResponse,
	httpPreDispatchErrorCodes,
	prepareHttpServerRequest,
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

const supportedMethods = new Set<HttpMethod>([
	'DELETE',
	'GET',
	'HEAD',
	'OPTIONS',
	'PATCH',
	'POST',
	'PUT',
])
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

const disabledPolicy: DisabledHttpBrowserPolicy = immutableRecord({
	enabled: false as const,
})

const assertExactKeys = (
	value: Readonly<Record<PropertyKey, unknown>>,
	keys: ReadonlySet<string>,
): void => {
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !keys.has(key)) {
			throw new TypeError(
				`HTTP browser policy contains unknown option: ${String(key)}`,
			)
		}
	}
}

const snapshotHeaderNames = (value: unknown): readonly string[] => {
	if (!isUnknownArray(value) || value.length === 0) {
		throw new TypeError(
			'HTTP browser policy allowedHeaders must be a non-empty array',
		)
	}
	const headers: string[] = []
	const normalized = new Set<string>()
	for (const header of value) {
		if (typeof header !== 'string' || !headerNamePattern.test(header)) {
			throw new TypeError(
				'HTTP browser policy allowedHeaders must contain HTTP header names',
			)
		}
		const name = header.toLowerCase()
		if (normalized.has(name)) {
			throw new TypeError(
				'HTTP browser policy allowedHeaders must not contain duplicates',
			)
		}
		normalized.add(name)
		headers.push(header)
	}
	if (!normalized.has(httpApplicationIdHeader.toLowerCase())) {
		throw new TypeError(
			`HTTP browser policy allowedHeaders must include ${httpApplicationIdHeader}`,
		)
	}
	return immutableArray(headers)
}

const snapshotMethods = (value: unknown): readonly HttpMethod[] => {
	if (!isUnknownArray(value) || value.length === 0) {
		throw new TypeError(
			'HTTP browser policy allowedMethods must be a non-empty array',
		)
	}
	const methods: HttpMethod[] = []
	const unique = new Set<HttpMethod>()
	for (const method of value) {
		if (
			typeof method !== 'string' ||
			!supportedMethods.has(method as HttpMethod)
		) {
			throw new TypeError(
				'HTTP browser policy allowedMethods contains an unsupported method',
			)
		}
		const supportedMethod = method as HttpMethod
		if (unique.has(supportedMethod)) {
			throw new TypeError(
				'HTTP browser policy allowedMethods must not contain duplicates',
			)
		}
		unique.add(supportedMethod)
		methods.push(supportedMethod)
	}
	return immutableArray(methods)
}

const snapshotOrigins = (value: unknown): '*' | readonly string[] => {
	if (value === '*') return '*'
	if (!isUnknownArray(value) || value.length === 0) {
		throw new TypeError(
			'HTTP browser policy allowedOrigins must be * or a non-empty array',
		)
	}
	const origins: string[] = []
	const unique = new Set<string>()
	for (const origin of value) {
		if (typeof origin !== 'string') {
			throw new TypeError(
				'HTTP browser policy allowedOrigins must contain serialized origins',
			)
		}
		let parsed: URL
		try {
			parsed = new URL(origin)
		} catch {
			throw new TypeError(
				'HTTP browser policy allowedOrigins must contain serialized origins',
			)
		}
		if (parsed.origin !== origin || parsed.origin === 'null') {
			throw new TypeError(
				'HTTP browser policy allowedOrigins must contain serialized origins',
			)
		}
		if (unique.has(origin)) {
			throw new TypeError(
				'HTTP browser policy allowedOrigins must not contain duplicates',
			)
		}
		unique.add(origin)
		origins.push(origin)
	}
	return immutableArray(origins)
}

/** @internal Validates and snapshots browser policy before plugin effects. */
export const normalizeHttpBrowserPolicy = (
	value: unknown,
	masterEnabled: boolean,
): HttpBrowserPolicy => {
	if (value === undefined) return disabledPolicy
	if (!isPlainRecord(value)) {
		throw new TypeError('HTTP browser policy must be a plain object')
	}
	assertExactKeys(
		value,
		new Set([
			'allowedHeaders',
			'allowedMethods',
			'allowedOrigins',
			'credentials',
			'maxAgeSeconds',
		]),
	)
	const allowedOrigins = snapshotOrigins(value.allowedOrigins)
	const allowedMethods = snapshotMethods(value.allowedMethods)
	const allowedHeaders = snapshotHeaderNames(value.allowedHeaders)
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
				wildcardCredentialHeaders.has(header.toLowerCase()),
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

const hasCredentialHeader = (
	headers: readonly (readonly [string, string])[],
): boolean =>
	headers.some(([name]) => wildcardCredentialHeaders.has(name.toLowerCase()))

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

const parseRequestedHeaders = (
	value: string | undefined,
): readonly string[] => {
	if (value === undefined || value.trim().length === 0)
		return immutableArray([])
	const headers = value.split(',').map((header) => header.trim())
	if (headers.some((header) => !headerNamePattern.test(header))) {
		throw new HttpPreDispatchFailure(httpPreDispatchErrorCodes.badRequest)
	}
	return immutableArray(headers)
}

const hasCorsResponseHeaders = (headers: Headers): boolean =>
	corsResponseHeaderNames.some((name) => headers.has(name))

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

	let prepared: ReturnType<typeof prepareHttpServerRequest>
	try {
		prepared = prepareHttpServerRequest(input)
	} catch (error: unknown) {
		const code =
			error instanceof HttpPreDispatchFailure
				? error.code
				: httpPreDispatchErrorCodes.internalError
		return createHttpPreDispatchErrorResponse(
			code,
			globalThis.crypto.randomUUID(),
		)
	}
	const origin = readPreparedHeader(prepared.originalHeaders, 'Origin')
	if (origin === undefined) return next()

	const requestedMethod = readPreparedHeader(
		prepared.originalHeaders,
		'Access-Control-Request-Method',
	)
	const isPreflight =
		prepared.input.request.method === 'OPTIONS' && requestedMethod !== undefined
	if (isPreflight) {
		let requestedHeaders: readonly string[]
		try {
			requestedHeaders = parseRequestedHeaders(
				readPreparedHeader(
					prepared.originalHeaders,
					'Access-Control-Request-Headers',
				),
			)
		} catch {
			return createHttpPreDispatchErrorResponse(
				httpPreDispatchErrorCodes.badRequest,
				prepared.requestId,
			)
		}
		const allowedHeaderNames = new Set(
			policy.allowedHeaders.map((header) => header.toLowerCase()),
		)
		const accepted =
			isAllowedOrigin(policy, origin) &&
			supportedMethods.has(requestedMethod as HttpMethod) &&
			policy.allowedMethods.includes(requestedMethod as HttpMethod) &&
			requestedHeaders.every((header) =>
				allowedHeaderNames.has(header.toLowerCase()),
			)
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
	if (hasCorsResponseHeaders(headers)) {
		return createHttpPreDispatchErrorResponse(
			httpPreDispatchErrorCodes.internalError,
			prepared.requestId,
		)
	}
	addVary(headers, ['Origin'])
	if (
		isAllowedOrigin(policy, origin) &&
		(policy.allowedOrigins !== '*' ||
			!hasCredentialHeader(prepared.originalHeaders))
	) {
		applyAllowedOrigin(headers, policy, origin)
	}
	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	})
}
