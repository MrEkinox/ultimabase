import type { CapabilityProviderDeclaration } from '@ultimabase/core/plugin'
import { isPlainRecord } from '@ultimabase/shared'

import {
	httpRoute,
	provideHttpEndpoints,
	type HttpMethod,
	type HttpRequestHandler,
	type httpEndpointContributionsCapability,
} from './endpoints.js'

/** One `"<METHOD> /<path>"` key of {@link httpRoutes}. */
export type HttpRouteKey = `${HttpMethod} /${string}`

const httpMethods: ReadonlySet<string> = new Set<HttpMethod>([
	'DELETE',
	'GET',
	'HEAD',
	'OPTIONS',
	'PATCH',
	'POST',
	'PUT',
])

const isHttpMethod = (value: string): value is HttpMethod =>
	httpMethods.has(value)

const parseRouteKey = (
	key: string,
): Readonly<{ method: HttpMethod; path: string }> => {
	const separator = key.indexOf(' ')
	const method = key.slice(0, separator)
	const path = key.slice(separator + 1)
	if (separator <= 0 || !isHttpMethod(method) || !path.startsWith('/')) {
		throw new TypeError(
			`HTTP route key must be "<METHOD> /<path>": ${JSON.stringify(key)}`,
		)
	}
	return { method, path }
}

/**
 * Contributes the HTTP routes of the calling plugin, for `definePlugin`'s
 * `contributions` (ADR-0316). Each key names one method and exact path; its
 * protocol identity is the key itself.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: '@community/health',
 *   contributions: [httpRoutes({ 'GET /health': () => Response.json({ status: 'ok' }) })],
 * })
 * ```
 */
export const httpRoutes = (
	routes: Readonly<Record<HttpRouteKey, HttpRequestHandler>>,
): CapabilityProviderDeclaration<
	typeof httpEndpointContributionsCapability
> => {
	const untrusted: unknown = routes
	if (!isPlainRecord(untrusted)) {
		throw new TypeError('httpRoutes expects a plain object of handlers')
	}
	// Keys are validated now, so a malformed route fails at plugin definition.
	const definitions = Object.entries(routes).map(([key, handle]) => {
		const untrustedHandle: unknown = handle
		if (typeof untrustedHandle !== 'function') {
			throw new TypeError(`HTTP route ${key} handler must be a function`)
		}
		return { ...parseRouteKey(key), handle, key }
	})
	return provideHttpEndpoints({
		contributionId: 'routes',
		create: () =>
			definitions.map(({ handle, key, method, path }) =>
				httpRoute({
					handle,
					method,
					path,
					protocol: { name: key, version: '1.0.0' },
				}),
			),
	})
}
