import type {
	ApplicationCallbackExecutor,
	CapabilityProviderContribution,
	PluginIdentity,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	assertHttpEndpointDefinitions,
	type HttpEndpointContributionsCapability,
	type HttpEndpointDefinition,
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

/** Exposes one validated mount together with immutable ownership evidence. */
export interface OwnedHttpMount extends HttpMountDefinition {
	readonly provenance: HttpEndpointProvenance
}

export type OwnedHttpEndpoint = OwnedHttpMount | OwnedHttpRoute

/** Gives every provider the same immutable application-local endpoint graph. */
export interface HttpRouteGraph {
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

const throwEndpointCollision = (
	left: HttpEndpointDefinition,
	right: HttpEndpointDefinition,
): never => {
	throw new TypeError(
		`HTTP endpoint collision between ${left.kind} "${left.path}" and ${right.kind} "${right.path}"`,
	)
}

const assertNoEndpointCollision = (
	accepted: readonly OwnedHttpEndpoint[],
	candidate: HttpEndpointDefinition,
): void => {
	for (const endpoint of accepted) {
		if (
			candidate.kind === 'route' &&
			endpoint.kind === 'route' &&
			candidate.method === endpoint.method &&
			candidate.path === endpoint.path
		) {
			throwEndpointCollision(endpoint, candidate)
		}
		if (
			(candidate.kind === 'mount' || endpoint.kind === 'mount') &&
			pathsOverlap(candidate.path, endpoint.path)
		) {
			throwEndpointCollision(endpoint, candidate)
		}
	}
}

const invokeHandler = async (
	handle: HttpRequestHandler,
	request: Request,
	owner: PluginIdentity,
	callbacks: ApplicationCallbackExecutor,
): Promise<Response> => {
	const response = await callbacks.runPlugin(owner, () => handle(request))
	if (!(response instanceof Response)) {
		throw new TypeError('HTTP endpoint handlers must return a Response')
	}
	return response
}

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
	const handle: HttpRequestHandler = (request) =>
		invokeHandler(definition.handle, request, contribution.owner, callbacks)

	return definition.kind === 'route'
		? immutableRecord({ ...definition, handle, provenance })
		: immutableRecord({ ...definition, handle, provenance })
}

/** @internal Compiles deterministic routes while retaining exact callback owners. */
export const compileHttpRouteGraph = (
	contributions: readonly CapabilityProviderContribution<HttpEndpointContributionsCapability>[],
	callbacks: ApplicationCallbackExecutor,
): HttpRouteGraph => {
	const endpoints: OwnedHttpEndpoint[] = []
	let registrationIndex = 0

	for (const contribution of contributions) {
		assertHttpEndpointDefinitions(
			contribution.value,
			`HTTP endpoint capability ${contribution.owner.pluginId}/${contribution.contributionId}`,
		)
		for (const definition of contribution.value) {
			assertNoEndpointCollision(endpoints, definition)
			endpoints.push(
				ownEndpoint(definition, contribution, registrationIndex, callbacks),
			)
			registrationIndex += 1
		}
	}

	return immutableRecord({
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

const matchesMount = (pathname: string, mountPath: string): boolean =>
	mountPath === '/' ||
	pathname === mountPath ||
	pathname.startsWith(`${mountPath}/`)

/** @internal Selects an exact route before falling back to the first owned mount. */
export const selectHttpEndpoint = (
	graph: HttpRouteGraph,
	request: Request,
): OwnedHttpEndpoint | undefined => {
	const pathname = new URL(request.url).pathname
	const route = graph.routes.find(
		(candidate) =>
			candidate.method === request.method && candidate.path === pathname,
	)
	if (route !== undefined) return route
	return graph.mounts.find((candidate) =>
		matchesMount(pathname, candidate.path),
	)
}
