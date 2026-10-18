import {
	getPluginFieldWireCodec,
	type ApplicationExposurePlan,
	type CompiledSchemaRegistry,
	type GenericField,
	type GenericOutputDescriptor,
	type SchemaDefinition,
} from '@ultimabase/core'
import type { PluginIdentity } from '@ultimabase/core/plugin'
import type { HttpMethod } from '@ultimabase/http-plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { restFieldProtocol } from './field-codecs.js'
import type { RestMethodName } from './rules.js'
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

/**
 * Compiles the native routes of every method the exposure plan serves
 * (ADR-0347), in template order; REST decides paths, never exposure.
 */
export const compileRestRouteFragment = (
	options: Readonly<{
		basePath: string
		owner: PluginIdentity
		plan: () => ApplicationExposurePlan<typeof restProtocol>
		pluginVersion: string
		schemas: CompiledSchemaRegistry
	}>,
): RestRouteFragmentValue => {
	for (const schema of options.schemas.values()) {
		// Storage ownership can never be converted into public CRUD exposure.
		if (
			schema.provenance.schema.owner.kind === 'plugin' &&
			Object.hasOwn(schema.definition, 'rest')
		) {
			throw new TypeError(
				`Plugin-owned schema "${schema.className}" cannot declare REST schema routes`,
			)
		}
	}
	const plugin = createRestRoutePlugin(options.owner, options.pluginVersion)
	const routes: RestRouteCandidate[] = []
	for (const { className, methods } of options.plan().schemas) {
		const schema = options.schemas.get(className)
		if (schema === undefined) continue
		const served = new Set(
			methods.flatMap(({ entry, kind }) =>
				kind === 'native' ? [entry.method] : [],
			),
		)
		const templates = restRouteTemplates.filter(({ operation }) =>
			served.has(restOperationMethods[operation]),
		)
		if (templates.length > 0) assertRestSchemaResultCodecs(schema)
		const classPath = restClassPath(options.basePath, className)
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
					schema: className,
					virtualFields,
				}),
			)
		}
	}
	return createRestRouteFragment(routes)
}
