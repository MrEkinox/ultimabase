import {
	defineOperationTransport,
	type GenericOutputDescriptor,
	type OperationTransportProtocol,
	type SchemaContributionProvenance,
} from '@ultimabase/core'
import {
	defineCapability,
	type CapabilityToken,
	type PluginIdentity,
} from '@ultimabase/core/plugin'
import type { HttpMethod } from '@ultimabase/http-plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

/** Names the fixed REST protocol represented by generated route metadata. */
export const restProtocol: OperationTransportProtocol<
	'ultimabase.rest',
	'1.0.0'
> = defineOperationTransport({
	name: 'ultimabase.rest',
	version: '1.0.0',
})

export type RestSchemaOperation =
	| 'bulkCreate'
	| 'bulkDelete'
	| 'bulkUpdate'
	| 'bulkUpsert'
	| 'count'
	| 'create'
	| 'delete'
	| 'exists'
	| 'find'
	| 'first'
	| 'get'
	| 'update'
	| 'upsert'

/** Identifies one application-local compilation by stable object identity. */
export interface RestApplicationProvenance {
	readonly kind: 'application'
}

type RestRoutePlugin = Readonly<PluginIdentity & { readonly version: string }>

/** Retains every owner and protocol fact behind one generated schema route. */
export interface RestRouteProvenance {
	readonly application: RestApplicationProvenance
	readonly method: HttpMethod
	readonly operation: RestSchemaOperation
	readonly path: string
	readonly plugin: RestRoutePlugin
	readonly protocolVersion: typeof restProtocol.version
	readonly schema: SchemaContributionProvenance
}

/** Retains the inert declaration and REST owner behind one operation route. */
export interface RestPluginOperationRouteProvenance {
	readonly application: RestApplicationProvenance
	readonly method: 'POST'
	readonly operation: Readonly<{
		readonly errors: readonly string[]
		readonly name: string
		readonly version: string
	}>
	readonly path: string
	readonly plugin: RestRoutePlugin
	readonly protocolVersion: typeof restProtocol.version
}

/** Retains the inert mutation, schema, and REST owners behind one custom route. */
export interface RestSchemaMutationRouteProvenance {
	readonly application: RestApplicationProvenance
	readonly method: 'POST'
	readonly mutation: Readonly<{
		readonly command: string
		readonly name: string
		readonly owner: Readonly<{
			readonly instanceId?: string
			readonly pluginId: string
			readonly version: string
		}>
		readonly version: string
	}>
	readonly path: string
	readonly plugin: RestRoutePlugin
	readonly protocolVersion: typeof restProtocol.version
	readonly schema: SchemaContributionProvenance
}

/** Declares one generated schema route without parsing or executing a request. */
export interface RestSchemaRouteDefinition {
	readonly kind: 'rest-schema-route'
	readonly method: HttpMethod
	readonly operation: RestSchemaOperation
	/** Uses `{id}` only as inert UUID-v7 item-route metadata. */
	readonly path: string
	readonly protocol: typeof restProtocol
	readonly provenance: RestRouteProvenance
	readonly schema: string
	/** Advertises output-only schema values without exposing private dependencies. */
	readonly virtualFields: Readonly<Record<string, GenericOutputDescriptor>>
}

/** Declares one explicitly selected application operation route. */
export interface RestPluginOperationRouteDefinition {
	readonly errors: readonly string[]
	readonly kind: 'rest-plugin-operation-route'
	readonly method: 'POST'
	readonly operation: string
	readonly operationVersion: string
	readonly path: string
	readonly protocol: typeof restProtocol
	readonly provenance: RestPluginOperationRouteProvenance
}

/** Declares one exact plugin-owned schema mutation route. */
export interface RestSchemaMutationRouteDefinition {
	readonly command: string
	readonly errors: readonly string[]
	readonly kind: 'rest-schema-mutation-route'
	readonly method: 'POST'
	readonly mutation: string
	readonly mutationVersion: string
	readonly operation: 'schemaMutation'
	/** Places the exact UUID-v7 target before the fixed mutation path segment. */
	readonly path: string
	readonly protocol: typeof restProtocol
	readonly provenance: RestSchemaMutationRouteProvenance
	readonly schema: string
	readonly virtualFields: Readonly<Record<string, GenericOutputDescriptor>>
}

export type RestRouteDefinition =
	| RestPluginOperationRouteDefinition
	| RestSchemaMutationRouteDefinition
	| RestSchemaRouteDefinition

/** Exposes one deterministic application-local REST route snapshot. */
export interface RestRouteGraph {
	readonly protocol: typeof restProtocol
	readonly routes: readonly RestRouteDefinition[]
}

type RouteCandidate<TRoute extends RestRouteDefinition> = Omit<
	TRoute,
	'provenance'
> & {
	readonly provenance: Omit<TRoute['provenance'], 'application'>
}

/** @internal One compiled route before composition assigns its application. */
export type RestRouteCandidate =
	| RouteCandidate<RestPluginOperationRouteDefinition>
	| RouteCandidate<RestSchemaMutationRouteDefinition>
	| RouteCandidate<RestSchemaRouteDefinition>

export interface RestRouteFragmentValue {
	readonly routes: readonly RestRouteCandidate[]
}

const routeFragmentValues = new WeakSet<object>()

/** @internal Brands one immutable fragment produced by an official compiler. */
export const createRestRouteFragment = (
	routes: readonly RestRouteCandidate[],
): RestRouteFragmentValue => {
	const fragment = immutableRecord({ routes: immutableArray(routes) })
	routeFragmentValues.add(fragment)
	return fragment
}

/** @internal Snapshots the exact plugin identity and version owning a route. */
export const createRestRoutePlugin = (
	owner: PluginIdentity,
	version: string,
): RestRoutePlugin =>
	immutableRecord({
		...(owner.instanceId === undefined ? {} : { instanceId: owner.instanceId }),
		pluginId: owner.pluginId,
		version,
	})

const withApplication = (
	candidate: RestRouteCandidate,
	application: RestApplicationProvenance,
): RestRouteDefinition => {
	// Each branch keeps the route kind correlated with its provenance shape.
	switch (candidate.kind) {
		case 'rest-schema-route':
			return immutableRecord({
				...candidate,
				provenance: immutableRecord({ ...candidate.provenance, application }),
			})
		case 'rest-schema-mutation-route':
			return immutableRecord({
				...candidate,
				provenance: immutableRecord({ ...candidate.provenance, application }),
			})
		case 'rest-plugin-operation-route':
			return immutableRecord({
				...candidate,
				provenance: immutableRecord({ ...candidate.provenance, application }),
			})
	}
}

const routeOwner = ({ provenance: { plugin } }: RestRouteCandidate): string =>
	`${plugin.pluginId}${plugin.instanceId === undefined ? '' : `#${plugin.instanceId}`}`

const composeRouteGraph = (
	fragments: readonly RestRouteFragmentValue[],
): RestRouteGraph => {
	for (const fragment of fragments) {
		if (!isPlainRecord(fragment) || !routeFragmentValues.has(fragment)) {
			throw new TypeError('REST route fragment must use the official compiler')
		}
		if (!isUnknownArray(fragment.routes)) {
			throw new TypeError('REST route fragment routes must be an array')
		}
	}
	// One application identity is shared by every route of this compilation.
	const application = immutableRecord({ kind: 'application' as const })
	const accepted = new Map<string, RestRouteCandidate>()
	const routes: RestRouteDefinition[] = []
	for (const candidate of fragments.flatMap(({ routes }) => routes)) {
		const key = `${candidate.method}\0${candidate.path}`
		const existing = accepted.get(key)
		if (existing !== undefined) {
			throw new TypeError(
				`REST route collision for ${candidate.method} "${candidate.path}" between ${routeOwner(existing)} and ${routeOwner(candidate)}`,
			)
		}
		accepted.set(key, candidate)
		routes.push(withApplication(candidate, application))
	}
	return immutableRecord({
		protocol: restProtocol,
		routes: immutableArray(routes),
	})
}

/** @internal Composes every configured REST instance before HTTP integration. */
export const restRouteGraphCapability: CapabilityToken<
	RestRouteFragmentValue,
	RestRouteGraph,
	'ultimabase.rest.route-graph',
	'1.0.0',
	'multiple',
	'application'
> = defineCapability<RestRouteFragmentValue, RestRouteGraph>()({
	capabilityId: 'ultimabase.rest.route-graph',
	version: '1.0.0',
	cardinality: 'multiple',
	lifetime: 'application',
	providerPrivilege: 'transport:expose',
	compose: composeRouteGraph,
})

/** @internal Encodes one deterministic RFC 3986 path segment. */
export const encodeRestPathSegment = (value: string, label: string): string => {
	let encoded: string
	try {
		encoded = encodeURIComponent(value)
	} catch {
		throw new TypeError(`${label} must be valid Unicode`)
	}
	return encoded.replace(
		/[!'()*]/gu,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	)
}

/** @internal Joins the base path and one absolute route suffix (`/` mounts at the root). */
export const restRoutePath = (basePath: string, suffix: string): string =>
	`${basePath === '/' ? '' : basePath}${suffix}`

/**
 * @internal Lists the roots REST mounts below its base path: the first segment
 * of every compiled route, and the OpenAPI document when served. Other paths
 * under the base path stay free for other plugins (ADR-0324, 6.4a amendment).
 */
export const readRestMountRoots = (
	basePath: string,
	routePaths: readonly string[],
	openapi: boolean,
): readonly string[] => {
	const prefixLength = basePath === '/' ? 0 : basePath.length
	const roots = new Set(
		routePaths.map((path) =>
			restRoutePath(
				basePath,
				`/${path.slice(prefixLength).split('/')[1] ?? ''}`,
			),
		),
	)
	if (openapi) roots.add(restRoutePath(basePath, '/openapi.json'))
	return [...roots].sort()
}

/** @internal Builds the encoded collection path shared by schema-bound routes. */
export const restClassPath = (basePath: string, className: string): string =>
	restRoutePath(
		basePath,
		`/classes/${encodeRestPathSegment(className, `REST schema className ${className}`)}`,
	)
