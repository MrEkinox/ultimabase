import {
	defineCapability,
	defineOperationTransport,
	type CapabilityToken,
	type GenericOutputDescriptor,
	type OperationTransportProtocol,
	type PluginIdentity,
	type SchemaContributionProvenance,
} from '@ultimabase/core'
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

export type RestRouteDefinition =
	RestPluginOperationRouteDefinition | RestSchemaRouteDefinition

/** Exposes one deterministic application-local REST route snapshot. */
export interface RestRouteGraph {
	readonly protocol: typeof restProtocol
	readonly routes: readonly RestRouteDefinition[]
}

export interface RestSchemaRouteCandidate {
	readonly kind: 'rest-schema-route'
	readonly method: HttpMethod
	readonly operation: RestSchemaOperation
	readonly path: string
	readonly plugin: RestRoutePlugin
	readonly protocol: typeof restProtocol
	readonly schema: string
	readonly schemaProvenance: SchemaContributionProvenance
	readonly virtualFields: Readonly<Record<string, GenericOutputDescriptor>>
}

export interface RestPluginOperationRouteCandidate {
	readonly errors: readonly string[]
	readonly kind: 'rest-plugin-operation-route'
	readonly method: 'POST'
	readonly operation: string
	readonly operationVersion: string
	readonly path: string
	readonly plugin: RestRoutePlugin
	readonly protocol: typeof restProtocol
}

type RestRouteCandidate =
	RestPluginOperationRouteCandidate | RestSchemaRouteCandidate

export interface RestRouteFragmentValue {
	readonly routes: readonly RestRouteCandidate[]
}

const routeFragmentValues = new WeakSet<object>()
const applicationProvenances = new WeakSet<object>()

/** @internal Brands one immutable fragment produced by an official compiler. */
export const createRestRouteFragment = (
	routes: readonly RestRouteCandidate[],
): RestRouteFragmentValue => {
	const fragment = immutableRecord({ routes: immutableArray(routes) })
	routeFragmentValues.add(fragment)
	return fragment
}

const assertRouteFragments = (
	fragments: readonly RestRouteFragmentValue[],
): void => {
	for (const fragment of fragments) {
		if (!isPlainRecord(fragment) || !routeFragmentValues.has(fragment)) {
			throw new TypeError('REST route fragment must use the official compiler')
		}
		if (!isUnknownArray(fragment.routes)) {
			throw new TypeError('REST route fragment routes must be an array')
		}
	}
}

const throwRouteCollision = (
	left: RestRouteCandidate,
	right: RestRouteCandidate,
): never => {
	const owner = (route: RestRouteCandidate): string =>
		`${route.plugin.pluginId}${route.plugin.instanceId === undefined ? '' : `#${route.plugin.instanceId}`}`
	throw new TypeError(
		`REST route collision for ${right.method} "${right.path}" between ${owner(left)} and ${owner(right)}`,
	)
}

const createSchemaRoute = (
	application: RestApplicationProvenance,
	candidate: RestSchemaRouteCandidate,
): RestSchemaRouteDefinition => {
	const provenance = immutableRecord({
		application,
		method: candidate.method,
		operation: candidate.operation,
		path: candidate.path,
		plugin: candidate.plugin,
		protocolVersion: restProtocol.version,
		schema: candidate.schemaProvenance,
	})
	return immutableRecord({
		kind: candidate.kind,
		method: candidate.method,
		operation: candidate.operation,
		path: candidate.path,
		protocol: restProtocol,
		provenance,
		schema: candidate.schema,
		virtualFields: candidate.virtualFields,
	})
}

const createOperationRoute = (
	application: RestApplicationProvenance,
	candidate: RestPluginOperationRouteCandidate,
): RestPluginOperationRouteDefinition => {
	const operation = immutableRecord({
		errors: immutableArray(candidate.errors),
		name: candidate.operation,
		version: candidate.operationVersion,
	})
	const provenance = immutableRecord({
		application,
		method: candidate.method,
		operation,
		path: candidate.path,
		plugin: candidate.plugin,
		protocolVersion: restProtocol.version,
	})
	return immutableRecord({
		errors: operation.errors,
		kind: candidate.kind,
		method: candidate.method,
		operation: candidate.operation,
		operationVersion: candidate.operationVersion,
		path: candidate.path,
		protocol: restProtocol,
		provenance,
	})
}

const composeRouteGraph = (
	fragments: readonly RestRouteFragmentValue[],
): RestRouteGraph => {
	assertRouteFragments(fragments)
	const application = immutableRecord({ kind: 'application' as const })
	applicationProvenances.add(application)
	const accepted = new Map<string, RestRouteCandidate>()
	const routes: RestRouteDefinition[] = []

	for (const fragment of fragments) {
		for (const candidate of fragment.routes) {
			const key = `${candidate.method}\0${candidate.path}`
			const existing = accepted.get(key)
			if (existing !== undefined) throwRouteCollision(existing, candidate)
			accepted.set(key, candidate)
			routes.push(
				candidate.kind === 'rest-schema-route'
					? createSchemaRoute(application, candidate)
					: createOperationRoute(application, candidate),
			)
		}
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

/** Confirms two routes came from the same exact application compilation. */
export const isRestApplicationProvenance = (
	value: unknown,
): value is RestApplicationProvenance =>
	isPlainRecord(value) && applicationProvenances.has(value)
