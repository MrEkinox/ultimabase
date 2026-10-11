import type {
	ApplicationCallbackExecutor,
	CapabilityProviderContribution,
	PluginIdentity,
} from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	endpointDefinitions,
	type HttpEndpointContributionsCapability,
	type HttpEndpointDefinition,
	type HttpBrowserBootstrapRouteDefinition,
	type HttpMountDefinition,
	type HttpRequestHandler,
	type HttpRouteDefinition,
} from './endpoints.js'

/** Retains the exact plugin owner of one callable endpoint. */
export interface HttpEndpointProvenance {
	readonly contributionId: string
	readonly owner: PluginIdentity
	readonly pluginVersion: string
	readonly registrationIndex: number
}

/** Exposes one validated route together with immutable ownership evidence. */
export interface OwnedHttpRoute extends HttpRouteDefinition {
	readonly provenance: HttpEndpointProvenance
}

/** Exposes one browser bootstrap route with immutable ownership evidence. */
export interface OwnedHttpBrowserBootstrapRoute extends HttpBrowserBootstrapRouteDefinition {
	readonly provenance: HttpEndpointProvenance
}

/** Exposes one validated mount together with immutable ownership evidence. */
export interface OwnedHttpMount extends HttpMountDefinition {
	readonly provenance: HttpEndpointProvenance
}

export type OwnedHttpEndpoint =
	OwnedHttpBrowserBootstrapRoute | OwnedHttpMount | OwnedHttpRoute

/** Gives every provider the same immutable application-local endpoint graph. */
export interface HttpRouteGraph {
	readonly browserBootstraps: readonly OwnedHttpBrowserBootstrapRoute[]
	readonly endpoints: readonly OwnedHttpEndpoint[]
	readonly mounts: readonly OwnedHttpMount[]
	readonly routes: readonly OwnedHttpRoute[]
}

const pathsOverlap = (left: string, right: string): boolean =>
	left === '/' ||
	right === '/' ||
	left === right ||
	left.startsWith(`${right}/`) ||
	right.startsWith(`${left}/`)

// Mounts own a whole subtree; routes and browser bootstraps own one method and path.
const collides = (
	accepted: OwnedHttpEndpoint,
	candidate: HttpEndpointDefinition,
): boolean =>
	candidate.kind === 'mount' || accepted.kind === 'mount'
		? pathsOverlap(candidate.path, accepted.path)
		: candidate.method === accepted.method && candidate.path === accepted.path

const ownEndpoint = (
	definition: HttpEndpointDefinition,
	contribution: CapabilityProviderContribution<HttpEndpointContributionsCapability>,
	registrationIndex: number,
	callbacks: ApplicationCallbackExecutor,
): OwnedHttpEndpoint => {
	const provenance = immutableRecord({
		contributionId: contribution.contributionId,
		owner: immutableRecord(contribution.owner),
		pluginVersion: contribution.pluginVersion,
		registrationIndex,
	})
	const ownerHandle = definition.handle
	const handle: HttpRequestHandler = async (request) => {
		const response = await callbacks.runPlugin(contribution.owner, () =>
			ownerHandle(request),
		)
		if (!(response instanceof Response)) {
			throw new TypeError('HTTP endpoint handlers must return a Response')
		}
		return response
	}

	return immutableRecord({ ...definition, handle, provenance })
}

/** @internal Compiles deterministic routes while retaining exact callback owners. */
export const compileHttpRouteGraph = (
	contributions: readonly CapabilityProviderContribution<HttpEndpointContributionsCapability>[],
	callbacks: ApplicationCallbackExecutor,
): HttpRouteGraph => {
	const endpoints: OwnedHttpEndpoint[] = []
	for (const contribution of contributions) {
		const definitions = endpointDefinitions.validate(
			contribution.value,
			`HTTP endpoint capability ${contribution.owner.pluginId}/${contribution.contributionId}`,
		)
		for (const definition of definitions) {
			const collision = endpoints.find((endpoint) =>
				collides(endpoint, definition),
			)
			if (collision !== undefined) {
				throw new TypeError(
					`HTTP endpoint collision between ${collision.kind} "${collision.path}" and ${definition.kind} "${definition.path}"`,
				)
			}
			endpoints.push(
				ownEndpoint(definition, contribution, endpoints.length, callbacks),
			)
		}
	}

	return immutableRecord({
		browserBootstraps: immutableArray(
			endpoints.filter(
				(endpoint): endpoint is OwnedHttpBrowserBootstrapRoute =>
					endpoint.kind === 'browser-bootstrap',
			),
		),
		endpoints: immutableArray(endpoints),
		mounts: immutableArray(
			endpoints.filter(
				(endpoint): endpoint is OwnedHttpMount => endpoint.kind === 'mount',
			),
		),
		routes: immutableArray(
			endpoints.filter(
				(endpoint): endpoint is OwnedHttpRoute => endpoint.kind === 'route',
			),
		),
	})
}

/** @internal Selects an exact route before falling back to the first owned mount. */
export const selectHttpEndpoint = (
	graph: HttpRouteGraph,
	request: Request,
): OwnedHttpEndpoint | undefined => {
	const pathname = new URL(request.url).pathname
	const exact = (candidate: OwnedHttpRoute | OwnedHttpBrowserBootstrapRoute) =>
		candidate.method === request.method && candidate.path === pathname
	return (
		graph.routes.find(exact) ??
		graph.browserBootstraps.find(exact) ??
		graph.mounts.find(
			({ path }) =>
				path === '/' || pathname === path || pathname.startsWith(`${path}/`),
		)
	)
}
