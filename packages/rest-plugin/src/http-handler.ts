import {
	FrameworkError,
	getCurrentRequest,
	type ApplicationRequestExecutor,
	type CompiledSchemaRegistry,
	type SchemaDefinition,
} from '@ultimabase/core'
import { httpMount, type HttpMountDefinition } from '@ultimabase/http-plugin'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { executeRestMutationRequest } from './mutations.js'
import { createRestFindResponse, executeRestFindPage } from './read-pages.js'
import { executeRestReadRequest, type RestReadLimits } from './reads.js'
import {
	encodeRestJsonValue,
	encodeRestSchemaResult,
} from './response-values.js'
import {
	createRestCaughtErrorResponse,
	createRestJsonResponse,
	createRestResponseFailure,
	restResponseErrorCodes,
} from './responses.js'
import {
	encodeRestPathSegment,
	restProtocol,
	type RestRouteDefinition,
	type RestSchemaRouteDefinition,
} from './routes.js'
import { reservedSchemaRouteSegments } from './schema-routes.js'
import type {
	RestOperationTransport,
	RestSchemaMutationTransport,
} from './transports.js'

/** @internal Setup-owned routes and exposure bound after the HTTP mount exists. */
export interface RestHttpConfiguration {
	readonly limits: RestReadLimits
	readonly operationTransport: RestOperationTransport | undefined
	readonly routes: readonly RestRouteDefinition[]
	readonly schemaMutationTransport: RestSchemaMutationTransport | undefined
}

// Rejects aliases (empty, trailing, or non-canonically encoded segments) up front.
const isCanonicalPath = (pathname: string): boolean => {
	if (pathname.length > 1 && pathname.endsWith('/')) return false
	return pathname
		.slice(1)
		.split('/')
		.every((segment) => {
			try {
				return (
					segment.length > 0 &&
					encodeRestPathSegment(decodeURIComponent(segment), 'REST path') ===
						segment
				)
			} catch {
				return false
			}
		})
}

// Matches static routes before the one strict `{id}` item placeholder.
const matchRoute = (
	routes: readonly RestRouteDefinition[],
	method: string,
	pathname: string,
): Readonly<{ id?: string; route: RestRouteDefinition }> | undefined => {
	const exact = routes.find(
		(route) => route.method === method && route.path === pathname,
	)
	if (exact !== undefined) return { route: exact }
	const requestSegments = pathname.slice(1).split('/')
	for (const route of routes) {
		if (route.method !== method || !route.path.includes('{id}')) continue
		const segments = route.path.slice(1).split('/')
		if (segments.length !== requestSegments.length) continue
		let id: string | undefined
		const matches = segments.every((segment, index) => {
			const requestSegment = requestSegments[index]
			if (segment !== '{id}') return segment === requestSegment
			id = requestSegment
			return true
		})
		if (!matches || id === undefined) continue
		// A disabled collection route such as `/count` is not an item id: it must
		// answer "route not found", not "invalid id".
		if (
			route.kind !== 'rest-plugin-operation-route' &&
			reservedSchemaRouteSegments.has(id)
		)
			continue
		return { id, route }
	}
	return undefined
}

/** @internal Resolves JSON compatibility using the most specific media range. */
const readRestAcceptQuality = (value: string | null): number => {
	if (value === null) return 1
	let specificity = -1
	let quality = 0
	for (const rawRange of value.split(',')) {
		const [rawMediaType, ...rawParameters] = rawRange.split(';')
		const current = ['*/*', 'application/*', 'application/json'].indexOf(
			rawMediaType?.trim().toLowerCase() ?? '',
		)
		if (current < 0) continue
		let currentQuality = 1
		let valid = true
		let qualitySeen = false
		for (const rawParameter of rawParameters) {
			const parameter = rawParameter.trim().toLowerCase()
			if (parameter === 'charset=utf-8' || parameter === 'charset="utf-8"') {
				continue
			}
			if (!parameter.startsWith('q=') || qualitySeen) {
				valid = false
				continue
			}
			qualitySeen = true
			const parsed = Number(parameter.slice(2))
			if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) valid = false
			else currentQuality = parsed
		}
		if (!valid) continue
		if (current > specificity) {
			specificity = current
			quality = currentQuality
		} else if (current === specificity) {
			quality = Math.max(quality, currentQuality)
		}
	}
	return quality
}

const invalidResult = (): TypeError => new TypeError('Invalid REST result')

const notFound = (message: string): FrameworkError =>
	new FrameworkError('NOT_FOUND', message, {
		publicMessage: 'The requested object was not found.',
	})

/** @internal Applies the fixed status and envelope matrix to one schema result. */
export const createRestSchemaSuccessResponse = (
	route: RestSchemaRouteDefinition,
	schema: SchemaDefinition,
	result: unknown,
): Response => {
	const encode = (value: unknown): Readonly<Record<string, unknown>> =>
		encodeRestSchemaResult(schema, value, invalidResult)
	const { operation } = route
	if (operation === 'count') {
		if (typeof result !== 'number' || !Number.isSafeInteger(result)) {
			throw new TypeError('Invalid REST count result')
		}
		return createRestJsonResponse({ count: result }, 200)
	}
	if (operation === 'exists') {
		if (typeof result !== 'boolean') {
			throw new TypeError('Invalid REST exists result')
		}
		return createRestJsonResponse({ exists: result }, 200)
	}
	if (operation === 'find' || operation.startsWith('bulk')) {
		if (!isUnknownArray(result)) {
			throw new TypeError('Invalid REST collection result')
		}
		return createRestJsonResponse(
			{ results: result.map(encode) },
			operation === 'bulkCreate' ? 201 : 200,
		)
	}
	if (result === null && operation !== 'first') {
		throw notFound('REST mutation target was absent.')
	}
	return createRestJsonResponse(
		{ result: result === null ? null : encode(result) },
		operation === 'create' ? 201 : 200,
	)
}

// Collection mutations use the hyphenated REST mutation operation names.
const collectionMutations = {
	bulkCreate: 'bulk-create',
	bulkDelete: 'bulk-delete',
	bulkUpdate: 'bulk-update',
	bulkUpsert: 'bulk-upsert',
	create: 'create',
	upsert: 'upsert',
} as const

const executeSchemaRoute = async (
	route: RestSchemaRouteDefinition,
	id: string,
	request: Request,
	schema: SchemaDefinition,
	executor: ApplicationRequestExecutor,
	limits: RestReadLimits,
): Promise<unknown> => {
	const context = getCurrentRequest()
	const { operation } = route
	switch (operation) {
		case 'get':
		case 'find':
		case 'first':
		case 'count':
		case 'exists':
			// Only `get` reads the captured item identifier.
			return executeRestReadRequest(
				executor,
				context,
				schema,
				{ id, operation, request },
				limits,
			)
		case 'update':
		case 'delete':
			return executeRestMutationRequest(
				executor,
				context,
				schema,
				{ id, operation, request },
				limits,
			)
	}
	return executeRestMutationRequest(
		executor,
		context,
		schema,
		{ operation: collectionMutations[operation], request },
		limits,
	)
}

const executeRoute = async (
	route: RestRouteDefinition,
	id: string,
	request: Request,
	configuration: RestHttpConfiguration,
	executor: ApplicationRequestExecutor,
	schemas: CompiledSchemaRegistry,
): Promise<Response> => {
	const { limits, operationTransport, schemaMutationTransport } = configuration
	if (route.kind === 'rest-plugin-operation-route') {
		if (operationTransport === undefined) {
			throw new TypeError('REST operation transport is unavailable')
		}
		const result = await operationTransport.execute(
			getCurrentRequest(),
			route,
			request,
			limits,
		)
		return createRestJsonResponse(
			{ result: encodeRestJsonValue(result, invalidResult, schemas) },
			200,
		)
	}
	const requireSchema = (name: string): SchemaDefinition => {
		const schema = schemas.get(name)
		if (schema === undefined) {
			throw new TypeError('REST route schema is unavailable')
		}
		return schema
	}
	if (route.kind === 'rest-schema-route') {
		const schema = requireSchema(route.schema)
		if (route.operation === 'find') {
			return createRestFindResponse(
				schema,
				await executeRestFindPage(
					executor,
					getCurrentRequest(),
					schema,
					request,
					limits,
				),
			)
		}
		const result = await executeSchemaRoute(
			route,
			id,
			request,
			schema,
			executor,
			limits,
		)
		return createRestSchemaSuccessResponse(route, schema, result)
	}
	if (schemaMutationTransport === undefined) {
		throw new TypeError('REST schema mutation transport is unavailable')
	}
	const schema = requireSchema(route.schema)
	const result = await schemaMutationTransport.execute(
		getCurrentRequest(),
		route,
		id,
		request,
		schema,
		limits,
	)
	if (result === null) {
		throw notFound('REST schema mutation target was absent.')
	}
	return createRestJsonResponse(
		{ result: encodeRestSchemaResult(schema, result, invalidResult) },
		200,
	)
}

const restHttpProtocol = immutableRecord({
	name: restProtocol.name,
	version: restProtocol.version,
})

/**
 * @internal Creates one instance-owned HTTP dispatcher. Its configuration is
 * read per request because setup binds routes only after the mount exists.
 */
export const createRestHttpMounts = (
	mountPath: string,
	executor: ApplicationRequestExecutor,
	schemas: CompiledSchemaRegistry,
	readConfiguration: () => RestHttpConfiguration | undefined,
): readonly HttpMountDefinition[] => {
	const versionRoot = mountPath === '/' ? '/v1' : `${mountPath}/v1`
	const handle = async (request: Request): Promise<Response> => {
		const requestId = getCurrentRequest().requestId
		const pathname = new URL(request.url).pathname
		const configuration = readConfiguration()
		const failure = !isCanonicalPath(pathname)
			? restResponseErrorCodes.badRequest
			: pathname !== versionRoot && !pathname.startsWith(`${versionRoot}/`)
				? restResponseErrorCodes.unsupportedVersion
				: undefined
		if (failure !== undefined) {
			return createRestResponseFailure(failure, requestId)
		}
		const match = matchRoute(
			configuration?.routes ?? [],
			request.method,
			pathname,
		)
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
		const { route } = match
		try {
			if (configuration === undefined) {
				throw new TypeError('REST owner state is unavailable')
			}
			return await executeRoute(
				route,
				match.id ?? '',
				request,
				configuration,
				executor,
				schemas,
			)
		} catch (error: unknown) {
			if (request.signal.aborted) throw error
			return createRestCaughtErrorResponse(error, requestId, {
				...(route.kind === 'rest-schema-route' ? {} : { route }),
				statusFor: (operation, code) =>
					configuration?.operationTransport?.statusFor(operation, code) ??
					configuration?.schemaMutationTransport?.statusFor(operation, code),
			})
		}
	}
	return immutableArray([
		httpMount({ handle, path: mountPath, protocol: restHttpProtocol }),
	])
}
