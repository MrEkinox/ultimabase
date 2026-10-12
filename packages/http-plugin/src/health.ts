import { assertExactOptions } from './definitions.js'
import { httpRoute, type HttpRouteDefinition } from './endpoints.js'
import type { OwnedHttpEndpoint } from './route-graph.js'

/** Moves the built-in health route (ADR-0323). */
export interface HttpHealthOptions {
	/** Absolute path of the health route. @default '/health' */
	readonly path: string
}

/** @internal Validates `health` and returns the route path, or `undefined` when removed. */
export const normalizeHttpHealthPath = (value: unknown): string | undefined => {
	if (value === false) return undefined
	if (value === undefined) return '/health'
	assertExactOptions(value, ['path'], 'HTTP plugin health')
	if (typeof value.path !== 'string') {
		throw new TypeError('HTTP plugin health path must be a string')
	}
	return value.path
}

/**
 * @internal The built-in route: 200 `{ status: 'OK' }` or 503
 * `{ status: 'DEGRADED' }` from the application's health, never its cause.
 */
export const createHttpHealthRoute = (
	path: string,
	readHealth: () => Promise<'OK' | 'DEGRADED'>,
): HttpRouteDefinition =>
	httpRoute({
		handle: async () => {
			const status = await readHealth()
			return Response.json({ status }, { status: status === 'OK' ? 200 : 503 })
		},
		method: 'GET',
		path,
		protocol: { name: `GET ${path}`, version: '1.0.0' },
	})

/**
 * @internal Recognizes the HTTP plugin's own health route; probes often share
 * one address, so rate limits never apply to it (ADR-0323 amendment).
 */
export const isHttpHealthRoute = (
	endpoint: OwnedHttpEndpoint,
	healthPath: string | undefined,
): boolean =>
	endpoint.kind === 'route' &&
	endpoint.path === healthPath &&
	endpoint.provenance.contributionId === 'official-http-routes'
