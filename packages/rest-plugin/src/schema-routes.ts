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
import {
	readRestSchemaRoutes,
	type RestBulkRoutes,
	type RestSchemaRoutesOption,
} from './options.js'
import {
	createRestRouteFragment,
	encodeRestPathSegment,
	restProtocol,
	type RestRouteFragmentValue,
	type RestSchemaRouteCandidate,
	type RestSchemaOperation,
} from './routes.js'

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
	return selection?.[operation]
}

const isEnabled = (
	schema: RestSchemaRoutesOption | undefined,
	defaults: RestSchemaRoutesOption | undefined,
	operation: RestSchemaOperation,
): boolean =>
	readSelection(schema, operation) ??
	readSelection(defaults, operation) ??
	builtInDefaults[operation]

/** Resolves whether one application schema exposes its explicitly bound mutations. */
export const areRestSchemaMutationsEnabled = (
	schema: RestSchemaRoutesOption | undefined,
	defaults: RestSchemaRoutesOption | undefined,
): boolean => {
	const read = (
		selection: RestSchemaRoutesOption | undefined,
	): boolean | undefined =>
		typeof selection === 'boolean' ? selection : selection?.mutations
	return read(schema) ?? read(defaults) ?? true
}

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
			getPluginFieldWireCodec(field, restFieldProtocol) === undefined
		) {
			throw new TypeError(
				`${fieldPath} requires an exact REST v1 field codec before route exposure`,
			)
		}
	}
}

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
		const options: unknown = output.options
		const children = isPlainRecord(options) ? options.fields : undefined
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
	const plugin = immutableRecord({
		...(options.owner.instanceId === undefined
			? {}
			: { instanceId: options.owner.instanceId }),
		pluginId: options.owner.pluginId,
		version: options.pluginVersion,
	})
	const routes: RestSchemaRouteCandidate[] = []

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
			assertRestSchemaResultCodecs(schema)
		}
		const virtualFields = readRestVirtualFields(schema)

		const classPath = `${options.basePath}/classes/${encodeRestPathSegment(schema.className, `REST schema className ${schema.className}`)}`
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
					virtualFields,
				}),
			)
		}
	}

	return createRestRouteFragment(routes)
}
