import {
	FrameworkError,
	getCurrentRequest,
	type ApplicationRequestExecutor,
	type CompiledSchemaRegistry,
	type PluginIdentity,
	type SchemaDefinition,
} from '@ultimabase/core'
import { httpMount, type HttpMountDefinition } from '@ultimabase/http-plugin'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	encodeRestJsonValue,
	encodeRestSchemaResult,
} from './response-values.js'
import { executeRestMutationRequest } from './mutation-execution.js'
import type { RestOperationTransport } from './operation-execution.js'
import { executeRestReadRequest } from './read-execution.js'
import {
	createRestCaughtErrorResponse,
	createRestJsonResponse,
	createRestResponseFailure,
	restResponseErrorCodes,
} from './responses.js'
import {
	restProtocol,
	type RestRouteDefinition,
	type RestRouteGraph,
	type RestSchemaOperation,
	type RestSchemaRouteDefinition,
} from './routes.js'
import {
	hasSupportedRestVersion,
	isCanonicalRestPath,
	matchRestRoute,
	readRestAcceptQuality,
	type MatchedRestRoute,
} from './http-routing.js'
import type { RestReadLimits } from './reads.js'

interface RestOwnerHttpState {
	limits: RestReadLimits | undefined
	operationTransport: RestOperationTransport | undefined
	routes: readonly RestRouteDefinition[]
}

interface ConfiguredRestOwnerHttpState {
	readonly limits: RestReadLimits
	readonly operationTransport: RestOperationTransport | undefined
}

const ownerStates = new WeakMap<
	ApplicationRequestExecutor,
	Map<string, RestOwnerHttpState>
>()

const ownerKey = (owner: PluginIdentity): string =>
	`${owner.pluginId}\0${owner.instanceId ?? ''}`

const routeOwner = (route: RestRouteDefinition): PluginIdentity =>
	immutableRecord({
		pluginId: route.provenance.plugin.pluginId,
		...(route.provenance.plugin.instanceId === undefined
			? {}
			: { instanceId: route.provenance.plugin.instanceId }),
	})

/** @internal Attaches setup-owned routes and operation exposure to one HTTP mount. */
export const configureRestHttpOwner = (
	executor: ApplicationRequestExecutor,
	graph: RestRouteGraph,
	owner: PluginIdentity,
	limits: RestReadLimits,
	operationTransport: RestOperationTransport | undefined,
): void => {
	const state = ownerStates.get(executor)?.get(ownerKey(owner))
	const routes = graph.routes.filter(
		(route) => ownerKey(routeOwner(route)) === ownerKey(owner),
	)
	if (state === undefined) {
		if (routes.length > 0)
			throw new TypeError('REST HTTP owner state is unavailable')
		return
	}
	state.routes = immutableArray(routes)
	state.limits = limits
	state.operationTransport = operationTransport
}

const schemaResult = (
	schema: SchemaDefinition,
	value: unknown,
): Readonly<Record<string, unknown>> =>
	encodeRestSchemaResult(
		schema,
		value,
		() => new TypeError('Invalid REST result'),
	)

/** @internal Applies the fixed status and envelope matrix to one schema result. */
export const createRestSchemaSuccessResponse = (
	route: RestSchemaRouteDefinition,
	schema: SchemaDefinition,
	result: unknown,
): Response => {
	if (route.operation === 'count') {
		if (typeof result !== 'number' || !Number.isSafeInteger(result)) {
			throw new TypeError('Invalid REST count result')
		}
		return createRestJsonResponse({ count: result }, 200)
	}
	if (route.operation === 'exists') {
		if (typeof result !== 'boolean')
			throw new TypeError('Invalid REST exists result')
		return createRestJsonResponse({ exists: result }, 200)
	}
	if (route.operation === 'find' || route.operation.startsWith('bulk')) {
		if (!isUnknownArray(result))
			throw new TypeError('Invalid REST collection result')
		return createRestJsonResponse(
			{ results: result.map((item) => schemaResult(schema, item)) },
			route.operation === 'bulkCreate' ? 201 : 200,
		)
	}
	if (result === null && route.operation !== 'first') {
		throw new FrameworkError('NOT_FOUND', 'REST mutation target was absent.', {
			publicMessage: 'The requested object was not found.',
		})
	}
	return createRestJsonResponse(
		{ result: result === null ? null : schemaResult(schema, result) },
		route.operation === 'create' ? 201 : 200,
	)
}

const mutationOperation = (
	operation: RestSchemaOperation,
):
	| 'bulk-create'
	| 'bulk-delete'
	| 'bulk-update'
	| 'bulk-upsert'
	| 'create'
	| 'delete'
	| 'update'
	| 'upsert' => {
	switch (operation) {
		case 'bulkCreate':
			return 'bulk-create'
		case 'bulkDelete':
			return 'bulk-delete'
		case 'bulkUpdate':
			return 'bulk-update'
		case 'bulkUpsert':
			return 'bulk-upsert'
		case 'create':
			return 'create'
		case 'delete':
			return 'delete'
		case 'update':
			return 'update'
		case 'upsert':
			return 'upsert'
		default:
			throw new TypeError('REST route is not a mutation')
	}
}

const executeSchemaRoute = async (
	route: RestSchemaRouteDefinition,
	id: string | undefined,
	request: Request,
	schema: SchemaDefinition,
	executor: ApplicationRequestExecutor,
	limits: RestReadLimits,
): Promise<Response> => {
	const context = getCurrentRequest()
	let result: unknown
	if (route.operation === 'get') {
		result = await executeRestReadRequest(
			executor,
			context,
			schema,
			{ id: id ?? '', operation: 'get', request },
			limits,
		)
	} else if (
		route.operation === 'find' ||
		route.operation === 'first' ||
		route.operation === 'count' ||
		route.operation === 'exists'
	) {
		result = await executeRestReadRequest(
			executor,
			context,
			schema,
			{ operation: route.operation, request },
			limits,
		)
	} else if (route.operation === 'update' || route.operation === 'delete') {
		result = await executeRestMutationRequest(
			executor,
			context,
			schema,
			{ id: id ?? '', operation: route.operation, request },
			limits,
		)
	} else {
		const operation = mutationOperation(route.operation)
		if (operation === 'update' || operation === 'delete') {
			throw new TypeError('REST item mutation requires an object identifier')
		}
		result = await executeRestMutationRequest(
			executor,
			context,
			schema,
			{ operation, request },
			limits,
		)
	}
	return createRestSchemaSuccessResponse(route, schema, result)
}

const executeMatchedRoute = async (
	match: MatchedRestRoute,
	request: Request,
	state: ConfiguredRestOwnerHttpState,
	executor: ApplicationRequestExecutor,
	schemas: CompiledSchemaRegistry,
): Promise<Response> => {
	if (match.route.kind === 'rest-schema-route') {
		const schema = schemas.get(match.route.schema)
		if (schema === undefined)
			throw new TypeError('REST route schema is unavailable')
		return executeSchemaRoute(
			match.route,
			match.id,
			request,
			schema,
			executor,
			state.limits,
		)
	}
	if (state.operationTransport === undefined) {
		throw new TypeError('REST operation transport is unavailable')
	}
	const result = await state.operationTransport.execute(
		getCurrentRequest(),
		match.route,
		request,
		state.limits,
	)
	return createRestJsonResponse(
		{
			result: encodeRestJsonValue(
				result,
				() => new TypeError('Invalid REST result'),
			),
		},
		200,
	)
}

const createMountHandler =
	(
		state: RestOwnerHttpState,
		mountPath: string,
		executor: ApplicationRequestExecutor,
		schemas: CompiledSchemaRegistry,
	) =>
	async (request: Request): Promise<Response> => {
		const requestId = getCurrentRequest().requestId
		const pathname = new URL(request.url).pathname
		if (!isCanonicalRestPath(pathname)) {
			return createRestResponseFailure(
				restResponseErrorCodes.badRequest,
				requestId,
			)
		}
		if (!hasSupportedRestVersion(pathname, mountPath)) {
			return createRestResponseFailure(
				restResponseErrorCodes.unsupportedVersion,
				requestId,
			)
		}
		const match = matchRestRoute(state.routes, request)
		if (match === undefined) {
			return createRestResponseFailure(
				restResponseErrorCodes.notFound,
				requestId,
			)
		}
		if (readRestAcceptQuality(request.headers.get('accept')) <= 0) {
			return createRestResponseFailure(
				restResponseErrorCodes.notAcceptable,
				requestId,
			)
		}
		const operationRoute =
			match.route.kind === 'rest-plugin-operation-route'
				? match.route
				: undefined
		try {
			if (state.limits === undefined) {
				throw new TypeError('REST owner state is unavailable')
			}
			return await executeMatchedRoute(
				match,
				request,
				{
					limits: state.limits,
					operationTransport: state.operationTransport,
				},
				executor,
				schemas,
			)
		} catch (error: unknown) {
			if (request.signal.aborted) throw error
			return createRestCaughtErrorResponse(error, requestId, {
				...(operationRoute === undefined ? {} : { route: operationRoute }),
				statusFor: (operation, code) =>
					state.operationTransport?.statusFor(operation, code),
			})
		}
	}

const restHttpProtocol = immutableRecord({
	name: restProtocol.name,
	version: restProtocol.version,
})

/** @internal Creates one instance-owned HTTP dispatcher before setup binds routes. */
export const createRestHttpMounts = (
	hasRoutes: boolean,
	mountPath: string,
	owner: PluginIdentity,
	executor: ApplicationRequestExecutor,
	schemas: CompiledSchemaRegistry,
): readonly HttpMountDefinition[] => {
	const state: RestOwnerHttpState = {
		limits: undefined,
		operationTransport: undefined,
		routes: immutableArray([]),
	}
	const states =
		ownerStates.get(executor) ?? new Map<string, RestOwnerHttpState>()
	states.set(ownerKey(owner), state)
	ownerStates.set(executor, states)
	if (!hasRoutes) return immutableArray([])
	return immutableArray([
		httpMount({
			handle: createMountHandler(state, mountPath, executor, schemas),
			path: mountPath,
			protocol: restHttpProtocol,
		}),
	])
}
