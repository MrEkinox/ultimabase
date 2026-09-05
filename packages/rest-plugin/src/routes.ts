import {
	defineCapability,
	defineOperationTransport,
	getPluginFieldWireCodec,
	type CapabilityToken,
	type CompiledSchemaRegistry,
	type GenericField,
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

import {
	readRestSchemaRoutes,
	type RestBulkRoutes,
	type RestSchemaRoutes,
	type RestSchemaRoutesOption,
} from './options.js'

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

/** Retains every owner and protocol fact behind one generated route. */
export interface RestRouteProvenance {
	readonly application: RestApplicationProvenance
	readonly method: HttpMethod
	readonly operation: RestSchemaOperation
	readonly path: string
	readonly plugin: Readonly<PluginIdentity & { readonly version: string }>
	readonly protocolVersion: typeof restProtocol.version
	readonly schema: SchemaContributionProvenance
}

/** Declares one generated schema route without parsing or executing a request. */
export interface RestRouteDefinition {
	readonly kind: 'rest-schema-route'
	readonly method: HttpMethod
	readonly operation: RestSchemaOperation
	/** Uses `{id}` only as inert UUID-v7 item-route metadata. */
	readonly path: string
	readonly protocol: typeof restProtocol
	readonly provenance: RestRouteProvenance
	readonly schema: string
}

/** Exposes one deterministic application-local REST route snapshot. */
export interface RestRouteGraph {
	readonly protocol: typeof restProtocol
	readonly routes: readonly RestRouteDefinition[]
}

interface RestRouteCandidate {
	readonly kind: 'rest-schema-route'
	readonly method: HttpMethod
	readonly operation: RestSchemaOperation
	readonly path: string
	readonly plugin: Readonly<PluginIdentity & { readonly version: string }>
	readonly protocol: typeof restProtocol
	readonly schema: string
	readonly schemaProvenance: SchemaContributionProvenance
}

interface RestRouteFragmentValue {
	readonly routes: readonly RestRouteCandidate[]
}

const routeFragmentValues = new WeakSet<object>()
const applicationProvenances = new WeakSet<object>()

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
			const provenance = immutableRecord({
				application,
				method: candidate.method,
				operation: candidate.operation,
				path: candidate.path,
				plugin: candidate.plugin,
				protocolVersion: restProtocol.version,
				schema: candidate.schemaProvenance,
			})
			routes.push(
				immutableRecord({
					kind: candidate.kind,
					method: candidate.method,
					operation: candidate.operation,
					path: candidate.path,
					protocol: restProtocol,
					provenance,
					schema: candidate.schema,
				}),
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

const builtInDefaults = immutableRecord({
	bulkCreate: false,
	bulkDelete: false,
	bulkUpdate: false,
	bulkUpsert: false,
	count: false,
	create: true,
	delete: true,
	exists: true,
	find: true,
	first: true,
	get: true,
	update: true,
	upsert: false,
}) satisfies Readonly<Record<RestSchemaOperation, boolean>>

const readBulkValue = (
	selection: RestSchemaRoutesOption | undefined,
	operation: keyof RestBulkRoutes,
): boolean | undefined => {
	if (typeof selection === 'boolean') return selection
	if (selection?.bulk === undefined) return undefined
	if (typeof selection.bulk === 'boolean') return selection.bulk
	return selection.bulk[operation]
}

const operationOptionNames = {
	count: 'count',
	create: 'create',
	delete: 'delete',
	exists: 'exists',
	find: 'find',
	first: 'first',
	get: 'get',
	update: 'update',
	upsert: 'upsert',
} as const satisfies Readonly<
	Record<Exclude<RestSchemaOperation, `bulk${string}`>, keyof RestSchemaRoutes>
>

const bulkOperationOptionNames = {
	bulkCreate: 'create',
	bulkDelete: 'delete',
	bulkUpdate: 'update',
	bulkUpsert: 'upsert',
} as const satisfies Readonly<
	Record<Extract<RestSchemaOperation, `bulk${string}`>, keyof RestBulkRoutes>
>

const isBulkOperation = (
	operation: RestSchemaOperation,
): operation is keyof typeof bulkOperationOptionNames =>
	Object.hasOwn(bulkOperationOptionNames, operation)

const readSelection = (
	selection: RestSchemaRoutesOption | undefined,
	operation: RestSchemaOperation,
): boolean | undefined => {
	if (typeof selection === 'boolean') return selection
	if (isBulkOperation(operation)) {
		return readBulkValue(selection, bulkOperationOptionNames[operation])
	}
	return selection?.[operationOptionNames[operation]]
}

const isEnabled = (
	schema: RestSchemaRoutesOption | undefined,
	defaults: RestSchemaRoutesOption | undefined,
	operation: RestSchemaOperation,
): boolean =>
	readSelection(schema, operation) ??
	readSelection(defaults, operation) ??
	builtInDefaults[operation]

const encodePathSegment = (value: string, label: string): string => {
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

const routeTemplates: readonly Readonly<{
	method: HttpMethod
	operation: RestSchemaOperation
	suffix: string
}>[] = immutableArray([
	{ method: 'GET', operation: 'find', suffix: '' },
	{ method: 'POST', operation: 'create', suffix: '' },
	{ method: 'POST', operation: 'find', suffix: '/query' },
	{ method: 'GET', operation: 'first', suffix: '/first' },
	{ method: 'POST', operation: 'first', suffix: '/first' },
	{ method: 'GET', operation: 'count', suffix: '/count' },
	{ method: 'POST', operation: 'count', suffix: '/count' },
	{ method: 'GET', operation: 'exists', suffix: '/exists' },
	{ method: 'POST', operation: 'exists', suffix: '/exists' },
	{ method: 'POST', operation: 'upsert', suffix: '/upsert' },
	{ method: 'POST', operation: 'bulkCreate', suffix: '/bulk/create' },
	{ method: 'POST', operation: 'bulkUpdate', suffix: '/bulk/update' },
	{ method: 'POST', operation: 'bulkDelete', suffix: '/bulk/delete' },
	{ method: 'POST', operation: 'bulkUpsert', suffix: '/bulk/upsert' },
	{ method: 'GET', operation: 'get', suffix: '/{id}' },
	{ method: 'PATCH', operation: 'update', suffix: '/{id}' },
	{ method: 'DELETE', operation: 'delete', suffix: '/{id}' },
])

const assertRestFieldCodecs = (
	fields: Readonly<Record<string, GenericField>>,
	path: string,
): void => {
	for (const [name, field] of Object.entries(fields)) {
		const fieldPath = `${path}.${name}`
		if (field.kind === 'object') {
			const fieldOptions: unknown = field.options
			if (!isPlainRecord(fieldOptions)) {
				throw new TypeError(`${fieldPath} requires embedded field metadata`)
			}
			const children = fieldOptions.fields
			if (!isPlainRecord(children)) {
				throw new TypeError(`${fieldPath} requires embedded field metadata`)
			}
			assertRestFieldCodecs(
				children as Readonly<Record<string, GenericField>>,
				fieldPath,
			)
			continue
		}
		if (
			field.kind.includes('.') &&
			getPluginFieldWireCodec(field, restProtocol) === undefined
		) {
			throw new TypeError(
				`${fieldPath} requires an exact REST v1 field codec before route exposure`,
			)
		}
	}
}

/** Compiles one instance fragment from the complete application schema graph. */
export const compileRestRouteFragment = (
	options: Readonly<{
		basePath: string
		defaultRoutes: RestSchemaRoutesOption | undefined
		owner: PluginIdentity
		pluginVersion: string
		schemas: CompiledSchemaRegistry
	}>,
): RestRouteFragmentValue => {
	const plugin = immutableRecord({
		...(options.owner.instanceId === undefined
			? {}
			: { instanceId: options.owner.instanceId }),
		pluginId: options.owner.pluginId,
		version: options.pluginVersion,
	})
	const routes: RestRouteCandidate[] = []

	for (const schema of options.schemas.values()) {
		const configuredRoutes = readRestSchemaRoutes(schema)
		if (schema.provenance.schema.owner.kind === 'plugin') {
			if (configuredRoutes !== undefined) {
				throw new TypeError(
					`Plugin-owned schema "${schema.className}" cannot declare REST schema routes`,
				)
			}
			continue
		}
		if (schema.provenance.schema.owner.kind !== 'application') continue
		if (
			routeTemplates.some((template) =>
				isEnabled(configuredRoutes, options.defaultRoutes, template.operation),
			)
		) {
			assertRestFieldCodecs(schema.fields, `${schema.className}.fields`)
		}

		const classPath = `${options.basePath}/classes/${encodePathSegment(schema.className, `REST schema className ${schema.className}`)}`
		for (const template of routeTemplates) {
			if (
				!isEnabled(configuredRoutes, options.defaultRoutes, template.operation)
			) {
				continue
			}
			routes.push(
				immutableRecord({
					kind: 'rest-schema-route' as const,
					method: template.method,
					operation: template.operation,
					path: `${classPath}${template.suffix}`,
					plugin,
					protocol: restProtocol,
					schema: schema.className,
					schemaProvenance: schema.provenance.schema,
				}),
			)
		}
	}

	const fragment = immutableRecord({ routes: immutableArray(routes) })
	routeFragmentValues.add(fragment)
	return fragment
}

/** Confirms two routes came from the same exact application compilation. */
export const isRestApplicationProvenance = (
	value: unknown,
): value is RestApplicationProvenance =>
	isPlainRecord(value) && applicationProvenances.has(value)
