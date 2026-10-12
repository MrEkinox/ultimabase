import type { CapabilityProviderDeclaration } from '@ultimabase/core/plugin'
import { isPlainRecord } from '@ultimabase/shared'

import { isHttpMethod } from './constants.js'
import { assertExactOptions } from './definitions.js'
import {
	normalizeHttpEndpointLimits,
	type HttpEndpointLimits,
} from './endpoint-limits.js'
import {
	httpRoute,
	provideHttpEndpoints,
	type HttpMethod,
	type HttpRequestHandler,
	type HttpRouteDefinition,
	type httpEndpointContributionsCapability,
} from './endpoints.js'

/** One `"<METHOD> /<path>"` key of {@link httpRoutes}. */
export type HttpRouteKey = `${HttpMethod} /${string}`

/** One route of a route record that also sets its own limits. */
export interface HttpRouteSettings extends HttpEndpointLimits {
	readonly handle: HttpRequestHandler
}

/**
 * Routes keyed by `"<METHOD> /<path>"`, each a handler or its settings; the
 * shape of `httpRoutes(...)` and `httpPlugin({ routes })`.
 * @example `{ 'GET /status': (request, { context }) => Response.json({ ok: true }) }`
 */
export type HttpRouteRecord = Readonly<
	Record<HttpRouteKey, HttpRequestHandler | HttpRouteSettings>
>

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

// The record type fixes the signature; only callability is checked at runtime.
const isHandler = (value: unknown): value is HttpRequestHandler =>
	typeof value === 'function'

// A route is a handler, or settings carrying one plus optional limits.
const readRoute = (key: string, value: unknown): HttpRouteSettings => {
	if (isHandler(value)) return { handle: value }
	if (!isPlainRecord(value)) {
		throw new TypeError(`HTTP route ${key} handler must be a function`)
	}
	assertExactOptions(
		value,
		['bodyLimit', 'handle', 'rateLimit'],
		`HTTP route ${key}`,
	)
	const handle = value.handle
	if (!isHandler(handle)) {
		throw new TypeError(`HTTP route ${key} handler must be a function`)
	}
	return { handle, ...normalizeHttpEndpointLimits(value, `HTTP route ${key}`) }
}

/**
 * @internal Validates one route record now, so a malformed key or handler
 * fails where the record is written; each route's protocol is its key.
 */
export const createHttpRouteDefinitions = (
	routes: unknown,
	label: string,
): readonly HttpRouteDefinition[] => {
	if (!isPlainRecord(routes)) {
		throw new TypeError(`${label} expects a plain object of handlers`)
	}
	return Object.entries(routes).map(([key, value]) =>
		httpRoute({
			...parseRouteKey(key),
			...readRoute(key, value),
			protocol: { name: key, version: '1.0.0' },
		}),
	)
}

/**
 * Contributes the HTTP routes of the calling plugin, for `definePlugin`'s
 * `contributions` (ADR-0316). Each key names one method and exact path; its
 * protocol identity is the key itself. Applications pass the same record to
 * `httpPlugin({ routes })` (ADR-0323).
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: '@community/status',
 *   contributions: [httpRoutes({ 'GET /status': () => Response.json({ status: 'ok' }) })],
 * })
 * ```
 */
export const httpRoutes = (
	routes: HttpRouteRecord,
): CapabilityProviderDeclaration<
	typeof httpEndpointContributionsCapability
> => {
	const definitions = createHttpRouteDefinitions(routes, 'httpRoutes')
	return provideHttpEndpoints({
		contributionId: 'routes',
		create: () => definitions,
	})
}
