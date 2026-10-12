import {
	getFieldSchemaTarget,
	type CompiledSchemaRegistry,
	type ExposedOperationTransportBinding,
} from '@ultimabase/core'

import {
	describeSchemaComponents,
	schemaRef,
	type JsonSchema,
} from './openapi-schemas.js'
import type {
	RestPluginOperationRouteDefinition,
	RestRouteDefinition,
	RestSchemaMutationRouteDefinition,
	RestSchemaRouteDefinition,
} from './routes.js'
import { restOperationMethods } from './schema-routes.js'

interface OpenApiOperation {
	readonly operationId: string
	readonly parameters?: readonly JsonSchema[]
	readonly requestBody?: JsonSchema
	readonly responses: JsonSchema
	readonly summary?: string
	readonly tags: readonly string[]
}

const json = (schema: JsonSchema): JsonSchema => ({
	content: { 'application/json': { schema } },
})

const queryParameter = (
	name: string,
	description: string,
	schema: JsonSchema = { type: 'string' },
): JsonSchema => ({ name, in: 'query', required: false, description, schema })

const parameters: Readonly<Record<string, JsonSchema>> = {
	after: queryParameter('after', 'Cursor of the previous page (`nextCursor`).'),
	include: queryParameter(
		'include',
		'Relations to include: `author,comments` or JSON include arguments.',
	),
	orderBy: queryParameter(
		'orderBy',
		'Comma-separated fields; a leading `-` sorts descending.',
	),
	select: queryParameter('select', 'Comma-separated fields to return.'),
	skip: queryParameter('skip', 'Rows to skip.', {
		type: 'integer',
		minimum: 0,
	}),
	take: queryParameter('take', 'Rows to return.', {
		type: 'integer',
		minimum: 0,
	}),
	where: queryParameter('where', 'JSON filter, the only filter form.'),
}

// GET parameters of each read, as the REST read normalizer accepts them.
const readParameters: Readonly<Record<string, readonly string[]>> = {
	count: ['where'],
	exists: ['where'],
	find: ['where', 'select', 'include', 'orderBy', 'take', 'skip', 'after'],
	first: ['where', 'select', 'include', 'orderBy'],
	get: ['select', 'include'],
}

const idParameter: JsonSchema = {
	name: 'id',
	in: 'path',
	required: true,
	schema: { type: 'string', format: 'uuid' },
}

const result = (schema: JsonSchema): JsonSchema => ({
	type: 'object',
	properties: { result: schema },
	required: ['result'],
})

const success = (status: string, schema: JsonSchema): JsonSchema => ({
	[status]: { description: 'Success.', ...json(schema) },
	default: { $ref: '#/components/responses/Error' },
})

const readBody: JsonSchema = {
	required: true,
	...json({
		type: 'object',
		description:
			'The same arguments as the GET parameters, as JSON (`where`, `select`, `include`, `orderBy`, `take`, `skip`, `after`).',
	}),
}

const describeSchemaRoute = (
	route: RestSchemaRouteDefinition,
): OpenApiOperation => {
	const className = route.schema
	const model = schemaRef(className)
	const create = schemaRef(`${className}CreateInput`)
	const update = schemaRef(`${className}UpdateInput`)
	const byBody = route.method === 'POST' && route.operation in readParameters
	const operationId = `${route.operation === 'first' ? 'findFirst' : restOperationMethods[route.operation]}${className}${byBody ? 'ByBody' : ''}`
	const common = { operationId, tags: [className] }
	const params = (names: readonly string[]) =>
		names.map((name) => parameters[name] ?? {})
	const body = (schema: JsonSchema): JsonSchema => ({
		required: true,
		...json(schema),
	})
	switch (route.operation) {
		case 'find':
			return {
				...common,
				...(byBody
					? { requestBody: readBody }
					: { parameters: params(readParameters.find ?? []) }),
				responses: success('200', {
					type: 'object',
					properties: {
						results: { type: 'array', items: model },
						nextCursor: { type: ['string', 'null'] },
					},
					required: ['results'],
				}),
			}
		case 'first':
		case 'count':
		case 'exists':
			return {
				...common,
				...(byBody
					? { requestBody: readBody }
					: { parameters: params(readParameters[route.operation] ?? []) }),
				responses: success(
					'200',
					route.operation === 'first'
						? result({ anyOf: [model, { type: 'null' }] })
						: {
								type: 'object',
								properties: {
									[route.operation]: {
										type: route.operation === 'count' ? 'integer' : 'boolean',
									},
								},
								required: [route.operation],
							},
				),
			}
		case 'get':
			return {
				...common,
				parameters: [idParameter, ...params(readParameters.get ?? [])],
				responses: success('200', result(model)),
			}
		case 'create':
			return {
				...common,
				parameters: params(['select', 'include']),
				requestBody: body(create),
				responses: success('201', result(model)),
			}
		case 'update':
			return {
				...common,
				parameters: [idParameter, ...params(['select', 'include'])],
				requestBody: body(update),
				responses: success('200', result(model)),
			}
		case 'delete':
			return {
				...common,
				parameters: [idParameter, ...params(['select'])],
				responses: success('200', result(model)),
			}
		case 'upsert':
			return {
				...common,
				requestBody: body({
					type: 'object',
					properties: { where: {}, create, update, select: {} },
					required: ['where', 'create', 'update'],
				}),
				responses: success('200', result(model)),
			}
		case 'bulkCreate':
		case 'bulkUpdate':
		case 'bulkDelete':
		case 'bulkUpsert': {
			const items: Readonly<Record<string, JsonSchema>> = {
				bulkCreate: { data: { type: 'array', items: create } },
				bulkDelete: { where: { type: 'array', items: {} } },
				bulkUpdate: {
					data: {
						type: 'array',
						items: { type: 'object', properties: { where: {}, data: update } },
					},
				},
				bulkUpsert: {
					data: {
						type: 'array',
						items: {
							type: 'object',
							properties: { where: {}, create, update },
						},
					},
				},
			}
			return {
				...common,
				requestBody: body({
					type: 'object',
					properties: { ...items[route.operation], select: {} },
				}),
				responses: success(route.operation === 'bulkCreate' ? '201' : '200', {
					type: 'object',
					properties: { results: { type: 'array', items: model } },
					required: ['results'],
				}),
			}
		}
	}
}

const describeCommandRoute = (
	route: RestSchemaMutationRouteDefinition,
): OpenApiOperation => ({
	operationId: `${route.command}${route.schema}`,
	parameters: [idParameter],
	requestBody: {
		required: false,
		...json({
			type: 'object',
			properties: { select: {}, include: {} },
			additionalProperties: false,
		}),
	},
	responses: success('200', result(schemaRef(route.schema))),
	tags: [route.schema],
})

const describeOperationRoute = (
	route: RestPluginOperationRouteDefinition,
	descriptor: ExposedOperationTransportBinding | undefined,
): OpenApiOperation => ({
	operationId: descriptor?.public?.name ?? route.operation,
	requestBody: {
		required: true,
		...json({
			type: 'object',
			properties: { input: toSchema(descriptor?.public?.input) },
			required: ['input'],
			additionalProperties: false,
		}),
	},
	responses: success('200', result(toSchema(descriptor?.public?.output))),
	tags: ['operations'],
})

const toSchema = (value: unknown): JsonSchema =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
		: {}

/** Converts `/classes/Todo/{id}` into the OpenAPI path relative to the server. */
const relativePath = (basePath: string, path: string): string =>
	basePath === '/' ? path : path.slice(basePath.length) || '/'

/**
 * Describes the routes one REST instance exposes as an OpenAPI 3.1 document
 * (ADR-0324): paths, fields, types and the constraints Standard JSON Schema
 * validators describe. It never describes an access rule.
 */
export const createRestOpenApiDocument = (options: {
	readonly basePath: string
	readonly operations: readonly ExposedOperationTransportBinding[]
	readonly routes: readonly RestRouteDefinition[]
	readonly schemas: CompiledSchemaRegistry
}): JsonSchema => {
	const paths: Record<string, Record<string, OpenApiOperation>> = {}
	const exposedSchemas = new Set<string>()
	const operations = new Map(
		options.operations.map((operation) => [operation.name, operation]),
	)
	for (const route of options.routes) {
		const path = relativePath(options.basePath, route.path)
		const item = paths[path] ?? {}
		paths[path] = item
		const method = route.method.toLowerCase()
		if (route.kind === 'rest-plugin-operation-route') {
			item[method] = describeOperationRoute(
				route,
				operations.get(route.operation),
			)
			continue
		}
		exposedSchemas.add(route.schema)
		item[method] =
			route.kind === 'rest-schema-route'
				? describeSchemaRoute(route)
				: describeCommandRoute(route)
	}
	const schemas: Record<string, JsonSchema> = {
		Pointer: {
			type: 'object',
			properties: {
				type: { const: 'pointer' },
				className: { type: 'string' },
				id: { type: 'string', format: 'uuid' },
			},
			required: ['type', 'className', 'id'],
		},
		Error: {
			type: 'object',
			properties: {
				error: {
					type: 'object',
					properties: {
						code: { type: 'string' },
						message: { type: 'string' },
						retryable: { type: 'boolean' },
						requestId: { type: 'string' },
						details: { type: 'object' },
					},
					required: ['code', 'message', 'retryable', 'requestId'],
				},
			},
			required: ['error'],
		},
	}
	// Included rows reference their target schema, which may itself be hidden.
	const described = new Set<string>()
	const describe = (className: string): void => {
		const schema = options.schemas.get(className)
		if (schema === undefined || described.has(className)) return
		described.add(className)
		Object.assign(schemas, describeSchemaComponents(schema))
		for (const field of Object.values(schema.persistedFields)) {
			const target = getFieldSchemaTarget(field)?.()
			if (target !== undefined) describe(target.className)
		}
	}
	for (const className of exposedSchemas) describe(className)
	return {
		openapi: '3.1.0',
		info: { title: 'UltimaBase REST API', version: '1' },
		jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
		servers: [{ url: options.basePath }],
		paths,
		components: {
			schemas,
			responses: {
				Error: {
					description: 'Error envelope.',
					...json(schemaRef('Error')),
				},
			},
		},
	}
}
