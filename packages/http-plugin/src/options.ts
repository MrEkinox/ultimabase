import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { assertNonEmptyString } from '@ultimabase/shared'

import {
	normalizeHttpBrowserOptions,
	type HttpBrowserPolicyOptions,
	type NormalizedHttpBrowserOptions,
} from './browser-policy.js'
import { defaultHttpBodyLimit } from './body-limit.js'
import {
	httpRequestTimeoutMsRange,
	isHttpRequestTimeoutMs,
} from './constants.js'
import { assertPositiveSafeInteger } from './endpoint-limits.js'
import type { HttpRouteDefinition } from './endpoints.js'
import { normalizeHttpHealthPath, type HttpHealthOptions } from './health.js'
import {
	createHttpRouteDefinitions,
	type HttpRouteRecord,
} from './http-routes.js'
import {
	normalizeHttpRateLimitOptions,
	normalizeHttpTrustProxy,
	type HttpRateLimitOptions,
	type HttpTrustProxy,
	type NormalizedHttpRateLimit,
} from './rate-limit.js'
import {
	normalizeHttpSecurityHeaders,
	type HttpSecurityHeadersOptions,
	type NormalizedHttpSecurityHeaders,
} from './security-headers.js'

/** Configures the HTTP foundation shared by REST, GraphQL and every route. */
export interface HttpPluginOptions {
	/**
	 * Public routing identity; it grants no authority. Requests without the
	 * `X-UltimaBase-Application-Id` header reach this application; a different
	 * value is refused with `HTTP_APPLICATION_UNKNOWN`.
	 * @default 'main'
	 */
	readonly appId?: string
	/**
	 * Requires the application header on every request, for several
	 * applications behind one proxy. @default false
	 */
	readonly requireApplicationId?: boolean
	/** Lets browser pages on these origins call the application (CORS). */
	readonly browser?: HttpBrowserPolicyOptions
	/** Accepts the `X-UltimaBase-Master-Key` header, verified by the application's MasterAuthority. */
	readonly master?: true
	/**
	 * Application routes, keyed by `"<METHOD> /<path>"`, with the same shape as
	 * `httpRoutes(...)`.
	 * @example `{ 'GET /status': (request, { context }) => Response.json({ ok: true }) }`
	 */
	readonly routes?: HttpRouteRecord
	/**
	 * The built-in health route answering 200 or 503 from `ultimabase.health()`;
	 * `false` removes it. @default { path: '/health' }
	 */
	readonly health?: HttpHealthOptions | false
	/** One deadline across context resolution and route handling, in milliseconds. @default 30000 */
	readonly requestTimeoutMs?: number
	/** Largest request body in bytes; routes and transports may set their own. @default 1048576 */
	readonly bodyLimit?: number
	/** Security headers added to responses; `false` removes them all. */
	readonly securityHeaders?: HttpSecurityHeadersOptions | false
	/**
	 * Proxies trusted for the client address and protocol: a hop count or
	 * their exact addresses. Without it, the socket peer is the client.
	 */
	readonly trustProxy?: HttpTrustProxy
	/** Limits requests per client address. @example { default: { perMinute: 300 } } */
	readonly rateLimit?: HttpRateLimitOptions
	/**
	 * Logs method, path, status, duration and request id of every request at
	 * `info`, never bodies, queries or headers. @default false
	 */
	readonly accessLog?: boolean
}

/** @internal The validated configuration one `httpPlugin()` call closes over. */
export interface NormalizedHttpPluginOptions {
	readonly accessLog: boolean
	readonly appId: string
	readonly bodyLimit: number
	readonly browser: NormalizedHttpBrowserOptions | undefined
	readonly healthPath: string | undefined
	readonly masterEnabled: boolean
	readonly rateLimit: NormalizedHttpRateLimit
	readonly requestTimeoutMs: number
	readonly requireApplicationId: boolean
	readonly routes: readonly HttpRouteDefinition[]
	readonly securityHeaders: NormalizedHttpSecurityHeaders
	readonly trustProxy: HttpTrustProxy | undefined
}

const assertOptionalBoolean = (value: unknown, label: string): boolean => {
	if (value === undefined) return false
	if (typeof value !== 'boolean') {
		throw new TypeError(`${label} must be a boolean`)
	}
	return value
}

/** @internal Rejects unknown keys and normalizes every plugin option. */
export const parseHttpPluginOptions: (
	options: HttpPluginOptions,
) => NormalizedHttpPluginOptions = definePluginOptionsParser({
	name: 'HTTP plugin options',
	keys: [
		'accessLog',
		'appId',
		'bodyLimit',
		'browser',
		'health',
		'master',
		'rateLimit',
		'requestTimeoutMs',
		'requireApplicationId',
		'routes',
		'securityHeaders',
		'trustProxy',
	] as const,
	normalize: (options): NormalizedHttpPluginOptions => {
		const appId = options.appId ?? 'main'
		assertNonEmptyString(appId, 'HTTP plugin appId')
		if (options.master !== undefined && options.master !== true) {
			throw new TypeError('HTTP plugin master must be true when provided')
		}
		const masterEnabled = options.master === true
		const requestTimeoutMs = options.requestTimeoutMs ?? 30_000
		if (!isHttpRequestTimeoutMs(requestTimeoutMs)) {
			throw new TypeError(
				`HTTP plugin requestTimeoutMs must be ${httpRequestTimeoutMsRange}`,
			)
		}
		const bodyLimit = options.bodyLimit ?? defaultHttpBodyLimit
		assertPositiveSafeInteger(bodyLimit, 'HTTP plugin bodyLimit')
		return {
			accessLog: assertOptionalBoolean(
				options.accessLog,
				'HTTP plugin accessLog',
			),
			appId,
			bodyLimit,
			browser: normalizeHttpBrowserOptions(options.browser, masterEnabled),
			healthPath: normalizeHttpHealthPath(options.health),
			masterEnabled,
			rateLimit: normalizeHttpRateLimitOptions(options.rateLimit),
			requestTimeoutMs,
			requireApplicationId: assertOptionalBoolean(
				options.requireApplicationId,
				'HTTP plugin requireApplicationId',
			),
			routes: createHttpRouteDefinitions(
				options.routes ?? {},
				'HTTP plugin routes',
			),
			securityHeaders: normalizeHttpSecurityHeaders(options.securityHeaders),
			trustProxy: normalizeHttpTrustProxy(options.trustProxy),
		}
	},
})
