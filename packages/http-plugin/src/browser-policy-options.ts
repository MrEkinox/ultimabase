import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	httpApplicationIdHeader,
	httpMasterKeyHeader,
	httpRequestIdHeader,
} from './constants.js'
import { assertExactOptions } from './definitions.js'
import type { HttpMethod } from './endpoints.js'

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
