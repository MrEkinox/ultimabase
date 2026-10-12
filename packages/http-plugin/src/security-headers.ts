import { immutableRecord } from '@ultimabase/shared'

import { assertExactOptions } from './definitions.js'
import { assertPositiveSafeInteger } from './endpoint-limits.js'

/** Configures Strict-Transport-Security, sent only on HTTPS requests. */
export interface HttpStrictTransportSecurityOptions {
	/** How long browsers keep using HTTPS, in seconds. @default 31536000 */
	readonly maxAgeSeconds?: number
	/** Applies the rule to every subdomain. @default true */
	readonly includeSubDomains?: boolean
}

/**
 * Security headers added to every response that does not set them itself;
 * `false` removes one (ADR-0323).
 * @example `{ frameOptions: 'SAMEORIGIN', hsts: false }`
 */
export interface HttpSecurityHeadersOptions {
	/** Sends `X-Content-Type-Options: nosniff`. @default true */
	readonly contentTypeOptions?: boolean
	/** The `X-Frame-Options` value. @default 'DENY' */
	readonly frameOptions?: 'DENY' | 'SAMEORIGIN' | false
	/** Strict-Transport-Security on HTTPS requests. @default { maxAgeSeconds: 31536000, includeSubDomains: true } */
	readonly hsts?: HttpStrictTransportSecurityOptions | false
}

/** @internal The headers to add, split by whether the request used HTTPS. */
export interface NormalizedHttpSecurityHeaders {
	readonly always: readonly (readonly [string, string])[]
	readonly https: readonly (readonly [string, string])[]
}

const normalizeHsts = (value: unknown): string | undefined => {
	if (value === false) return undefined
	if (value === undefined) return 'max-age=31536000; includeSubDomains'
	assertExactOptions(
		value,
		['includeSubDomains', 'maxAgeSeconds'],
		'HTTP plugin securityHeaders hsts',
	)
	const maxAgeSeconds = value.maxAgeSeconds ?? 31_536_000
	assertPositiveSafeInteger(
		maxAgeSeconds,
		'HTTP plugin securityHeaders hsts maxAgeSeconds',
	)
	const includeSubDomains = value.includeSubDomains ?? true
	if (typeof includeSubDomains !== 'boolean') {
		throw new TypeError(
			'HTTP plugin securityHeaders hsts includeSubDomains must be a boolean',
		)
	}
	return `max-age=${String(maxAgeSeconds)}${includeSubDomains ? '; includeSubDomains' : ''}`
}

/** @internal Validates `securityHeaders` before plugin effects. */
export const normalizeHttpSecurityHeaders = (
	value: unknown,
): NormalizedHttpSecurityHeaders => {
	if (value === false) return immutableRecord({ always: [], https: [] })
	const options = value ?? {}
	assertExactOptions(
		options,
		['contentTypeOptions', 'frameOptions', 'hsts'],
		'HTTP plugin securityHeaders',
	)
	const contentTypeOptions = options.contentTypeOptions ?? true
	if (typeof contentTypeOptions !== 'boolean') {
		throw new TypeError(
			'HTTP plugin securityHeaders contentTypeOptions must be a boolean',
		)
	}
	const frameOptions = options.frameOptions ?? 'DENY'
	if (
		frameOptions !== false &&
		frameOptions !== 'DENY' &&
		frameOptions !== 'SAMEORIGIN'
	) {
		throw new TypeError(
			"HTTP plugin securityHeaders frameOptions must be 'DENY', 'SAMEORIGIN' or false",
		)
	}
	const hsts = normalizeHsts(options.hsts)
	return immutableRecord({
		always: [
			...(contentTypeOptions
				? [['X-Content-Type-Options', 'nosniff'] as const]
				: []),
			...(frameOptions === false
				? []
				: [['X-Frame-Options', frameOptions] as const]),
		],
		https:
			hsts === undefined ? [] : [['Strict-Transport-Security', hsts] as const],
	})
}

/** @internal Adds the configured headers a response does not already carry. */
export const applyHttpSecurityHeaders = (
	response: Response,
	headers: NormalizedHttpSecurityHeaders,
	https: boolean,
): Response => {
	const added = https ? [...headers.always, ...headers.https] : headers.always
	const missing = added.filter(([name]) => !response.headers.has(name))
	if (missing.length === 0) return response
	const merged = new Headers(response.headers)
	for (const [name, value] of missing) merged.set(name, value)
	return new Response(response.body, {
		headers: merged,
		status: response.status,
		statusText: response.statusText,
	})
}
