import {
	getPluginFieldWireCodec,
	type CompiledSchemaRegistry,
	type GenericField,
	type GenericOutputDescriptor,
	type SchemaDefinition,
} from '@ultimabase/core'
import type { PluginIdentity } from '@ultimabase/core/plugin'
import type { HttpMethod } from '@ultimabase/http-plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { restFieldProtocol } from './field-codecs.js'
import {
	readRestSchemaRule,
	type NormalizedRestRule,
	type RestMethodName,
} from './rules.js'
import { isRestOutputKind } from './response-values.js'
import {
	createRestRouteFragment,
	createRestRoutePlugin,
	restClassPath,
	restProtocol,
	type RestRouteCandidate,
	type RestRouteFragmentValue,
	type RestSchemaOperation,
} from './routes.js'

// Built-in defaults used when neither the schema rule nor the plugin decides.
const builtInDefaults = immutableRecord({
	count: false,
	createMany: false,
	createOne: true,
	deleteMany: false,
	deleteOne: true,
	exists: true,
	findMany: true,
	findOne: true,
	updateMany: false,
	updateOne: true,
	upsertMany: false,
	upsertOne: false,
}) satisfies Readonly<Record<RestMethodName, boolean>>

/** The schema method each REST route operation belongs to (ADR-0324). */
export const restOperationMethods: Readonly<
	Record<RestSchemaOperation, RestMethodName>
> = immutableRecord({
	bulkCreate: 'createMany',
	bulkDelete: 'deleteMany',
	bulkUpdate: 'updateMany',
	bulkUpsert: 'upsertMany',
	count: 'count',
	create: 'createOne',
	delete: 'deleteOne',
	exists: 'exists',
	find: 'findMany',
	first: 'findOne',
	get: 'findOne',
	update: 'updateOne',
	upsert: 'upsertOne',
})

const isMethodName = (key: string): key is RestMethodName =>
	Object.hasOwn(builtInDefaults, key)

const readRule = (
	rule: NormalizedRestRule | undefined,
	key: string,
): boolean | undefined => (typeof rule === 'object' ? rule[key] : rule)

/**
 * Resolves one method or command: schema rule, then plugin default, then
 * built-in. A plugin command is exposed only when a rule names it, or when
 * a rule or the default is `true` (ADR-0324).
 */
export const isRestMethodEnabled = (
	schema: NormalizedRestRule | undefined,
	defaults: NormalizedRestRule | undefined,
	key: string,
): boolean =>
	readRule(schema, key) ??
	readRule(defaults, key) ??
	(isMethodName(key) ? builtInDefaults[key] : false)

/** Path templates of every native route, relative to the class path. */
export const restRouteTemplates: readonly Readonly<{
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

/** Collection-level segments (`count`, `first`, `bulk`…); never item identifiers. */
export const reservedSchemaRouteSegments: ReadonlySet<string> = new Set(
	restRouteTemplates.flatMap(({ suffix }) => {
		const segment = suffix.split('/')[1]
		return segment === undefined || segment === '{id}' ? [] : [segment]
	}),
)

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
		if (!isRestOutputKind(output.kind)) {
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
		defaultRule: NormalizedRestRule | undefined
		owner: PluginIdentity
		pluginVersion: string
		schemas: CompiledSchemaRegistry
	}>,
): RestRouteFragmentValue => {
	const plugin = createRestRoutePlugin(options.owner, options.pluginVersion)
	const routes: RestRouteCandidate[] = []
	for (const schema of options.schemas.values()) {
		const rule = readRestSchemaRule(schema)
		const owner = schema.provenance.schema.owner.kind
		// Storage ownership can never be converted into public CRUD exposure.
		if (owner === 'plugin' && rule !== undefined) {
			throw new TypeError(
				`Plugin-owned schema "${schema.className}" cannot declare REST schema routes`,
			)
		}
		if (owner !== 'application') continue
		const templates = restRouteTemplates.filter(({ operation }) =>
			isRestMethodEnabled(
				rule,
				options.defaultRule,
				restOperationMethods[operation],
			),
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
