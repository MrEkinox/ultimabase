import {
	getPluginFieldWireCodec,
	type CompiledSchemaRegistry,
	type GenericField,
	type GenericOutputDescriptor,
	type PluginIdentity,
	type SchemaDefinition,
} from '@ultimabase/core'
import type { HttpMethod } from '@ultimabase/http-plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { restFieldProtocol } from './field-codecs.js'
import { readRestSchemaRoutes, type RestSchemaRoutesOption } from './options.js'
import {
	createRestRouteFragment,
	createRestRoutePlugin,
	restClassPath,
	restProtocol,
	type RestRouteCandidate,
	type RestRouteFragmentValue,
	type RestSchemaOperation,
} from './routes.js'

type RestRouteSelection = RestSchemaOperation | 'mutations'

// Provenance-aware built-in defaults used when neither schema nor plugin decides.
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
	mutations: true,
	update: true,
	upsert: false,
}) satisfies Readonly<Record<RestRouteSelection, boolean>>

const bulkOptionNames = {
	bulkCreate: 'create',
	bulkDelete: 'delete',
	bulkUpdate: 'update',
	bulkUpsert: 'upsert',
} as const

const readSelection = (
	selection: RestSchemaRoutesOption | undefined,
	operation: RestRouteSelection,
): boolean | undefined => {
	if (typeof selection !== 'object') return selection
	switch (operation) {
		case 'bulkCreate':
		case 'bulkDelete':
		case 'bulkUpdate':
		case 'bulkUpsert': {
			const bulk = selection.bulk
			return typeof bulk === 'object' ? bulk[bulkOptionNames[operation]] : bulk
		}
	}
	return selection[operation]
}

/** Resolves one route selection: schema option, then plugin default, then built-in. */
export const isRestRouteEnabled = (
	schema: RestSchemaRoutesOption | undefined,
	defaults: RestSchemaRoutesOption | undefined,
	operation: RestRouteSelection,
): boolean =>
	readSelection(schema, operation) ??
	readSelection(defaults, operation) ??
	builtInDefaults[operation]

const routeTemplates: readonly Readonly<{
	method: HttpMethod
	operation: RestSchemaOperation
	suffix: string
}>[] = [
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
]

const builtInOutputKinds = new Set([
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'object',
	'string',
	'time',
	'uuid',
])

// Embedded object metadata is compiled by Core; REST only walks its children.
const readNestedFields = (options: unknown): unknown =>
	isPlainRecord(options) ? options.fields : undefined

const assertRestFieldCodecs = (
	fields: Readonly<Record<string, GenericField>>,
	path: string,
): void => {
	for (const [name, field] of Object.entries(fields)) {
		const fieldPath = `${path}.${name}`
		if (field.kind === 'object') {
			const children = readNestedFields(field.options)
			if (!isPlainRecord(children)) {
				throw new TypeError(`${fieldPath} requires embedded field metadata`)
			}
			assertRestFieldCodecs(
				children as Readonly<Record<string, GenericField>>,
				fieldPath,
			)
		} else if (
			field.kind.includes('.') &&
			getPluginFieldWireCodec(field, restFieldProtocol) === undefined
		) {
			throw new TypeError(
				`${fieldPath} requires an exact REST v1 field codec before route exposure`,
			)
		}
	}
}

const assertRestOutputDescriptors = (
	fields: Readonly<Record<string, GenericOutputDescriptor>>,
	path: string,
): void => {
	for (const [name, output] of Object.entries(fields)) {
		const outputPath = `${path}.${name}`
		if (!builtInOutputKinds.has(output.kind)) {
			throw new TypeError(
				`${outputPath} uses output kind ${output.kind} without an exact REST v1 representation`,
			)
		}
		if (output.kind !== 'object') continue
		const children = readNestedFields(output.options)
		if (!isPlainRecord(children)) {
			throw new TypeError(`${outputPath} requires output object metadata`)
		}
		assertRestOutputDescriptors(
			children as Readonly<Record<string, GenericOutputDescriptor>>,
			outputPath,
		)
	}
}

/** @internal Projects only inert outputs, never resolvers or their private dependencies. */
export const readRestVirtualFields = (
	schema: SchemaDefinition,
): Readonly<Record<string, GenericOutputDescriptor>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(schema.virtualFields).map(([name, field]) => [
				name,
				field.output,
			]),
		),
	)

/** Validates the complete schema-result codec used by native and custom routes. */
export const assertRestSchemaResultCodecs = (
	schema: SchemaDefinition,
): void => {
	assertRestFieldCodecs(schema.persistedFields, `${schema.className}.fields`)
	assertRestOutputDescriptors(
		readRestVirtualFields(schema),
		`${schema.className}.virtualFields`,
	)
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
	const plugin = createRestRoutePlugin(options.owner, options.pluginVersion)
	const routes: RestRouteCandidate[] = []
	for (const schema of options.schemas.values()) {
		const configuredRoutes = readRestSchemaRoutes(schema)
		const owner = schema.provenance.schema.owner.kind
		// Storage ownership can never be converted into public CRUD exposure.
		if (owner === 'plugin' && configuredRoutes !== undefined) {
			throw new TypeError(
				`Plugin-owned schema "${schema.className}" cannot declare REST schema routes`,
			)
		}
		if (owner !== 'application') continue
		const templates = routeTemplates.filter(({ operation }) =>
			isRestRouteEnabled(configuredRoutes, options.defaultRoutes, operation),
		)
		if (templates.length > 0) assertRestSchemaResultCodecs(schema)
		const classPath = restClassPath(options.basePath, schema.className)
		const virtualFields = readRestVirtualFields(schema)
		for (const { method, operation, suffix } of templates) {
			const path = `${classPath}${suffix}`
			routes.push(
				immutableRecord({
					kind: 'rest-schema-route' as const,
					method,
					operation,
					path,
					protocol: restProtocol,
					provenance: immutableRecord({
						method,
						operation,
						path,
						plugin,
						protocolVersion: restProtocol.version,
						schema: schema.provenance.schema,
					}),
					schema: schema.className,
					virtualFields,
				}),
			)
		}
	}
	return createRestRouteFragment(routes)
}
