import type {
	ApplicationOperationTransport,
	ApplicationSchemaMutationTransport,
	CompiledSchemaRegistry,
	ExposedSchemaMutationTransportBinding,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	defaultErrorStatuses,
	readRestErrorStatusMap,
	readRestOperationRouteMetadata,
	resolveRestOperationInputSchema,
} from './binding-metadata.js'
import {
	decodeParameter,
	invalidRestMutation,
	invalidRestOperation,
	restErrorDetails,
	type RestFailure,
} from './errors.js'
import { isUuidV7 } from './field-values.js'
import { decodeRestMutationData } from './nested-mutation-values.js'
import { readRestJsonBody } from './read-body.js'
import { decodeRestInclude, type RestReadLimits } from './reads.js'
import type {
	restProtocol,
	RestPluginOperationRouteDefinition,
	RestSchemaMutationRouteDefinition,
} from './routes.js'
import type { RequestContext } from '@ultimabase/core/plugin'

/** Exposes only the selected REST operation inventory and its execution method. */
export interface RestOperationTransport {
	readonly operations: readonly RestPluginOperationRouteDefinition[]
	execute(
		context: RequestContext,
		route: RestPluginOperationRouteDefinition,
		request: Request,
		limits: RestReadLimits,
	): Promise<unknown>
	statusFor(operation: string, code: string): number | undefined
}

/** Executes only the mutation routes compiled for one REST plugin instance. */
export interface RestSchemaMutationTransport {
	readonly mutations: readonly RestSchemaMutationRouteDefinition[]
	execute(
		context: RequestContext,
		route: RestSchemaMutationRouteDefinition,
		id: string,
		request: Request,
		schema: SchemaDefinition,
		limits: RestReadLimits,
	): Promise<unknown>
	statusFor(operation: string, code: string): number | undefined
}

/** @internal Pairs a public facade with the setup-only binder of its Core allowlist. */
export type RestBoundTransport<TTransport, TCore> = readonly [
	transport: TTransport,
	bind: (core: TCore) => void,
]

type StatusMaps = ReadonlyMap<string, Readonly<Record<string, number>>>

// Custom routes accept only a POST JSON body: no query string and no aliases.
const readCustomBody = async (
	request: Request,
	limits: RestReadLimits,
	fail: RestFailure,
	accepted: boolean,
): Promise<Readonly<Record<string, unknown>>> => {
	request.signal.throwIfAborted()
	if (!accepted) {
		throw fail(
			undefined,
			restErrorDetails('id', 'must be a UUID v7 identifier'),
		)
	}
	if (request.method !== 'POST') throw fail()
	if (new URL(request.url).search !== '') {
		throw fail(
			undefined,
			restErrorDetails('query', 'must be empty: this route takes a JSON body'),
		)
	}
	const body = await readRestJsonBody(request, limits.bodyBytes, fail)
	if (!isPlainRecord(body)) {
		throw fail(undefined, restErrorDetails('body', 'must be a JSON object'))
	}
	return body
}

/** @internal Creates an unbound operation facade during plugin setup. */
export const createRestOperationTransport = (
	routes: readonly RestPluginOperationRouteDefinition[],
	schemas: CompiledSchemaRegistry,
): RestBoundTransport<
	RestOperationTransport,
	ApplicationOperationTransport<typeof restProtocol>
> => {
	const operations = immutableArray(routes)
	let bound:
		| Readonly<{
				core: ApplicationOperationTransport<typeof restProtocol>
				inputSchemas: ReadonlyMap<string, SchemaDefinition>
				statuses: StatusMaps
		  }>
		| undefined

	const bind = (core: ApplicationOperationTransport<typeof restProtocol>) => {
		if (bound !== undefined) return
		const descriptors = new Map(
			core.operations.map((item) => [item.name, item]),
		)
		const statuses = new Map<string, Readonly<Record<string, number>>>()
		const inputSchemas = new Map<string, SchemaDefinition>()
		for (const route of operations) {
			const descriptor = descriptors.get(route.operation)
			if (descriptor?.version !== route.operationVersion) {
				throw new TypeError(
					`REST operation route ${route.operation} has no exact Core exposure`,
				)
			}
			const metadata = readRestOperationRouteMetadata(descriptor)
			statuses.set(route.operation, metadata.errors)
			const schema = resolveRestOperationInputSchema(
				metadata.inputSchema,
				descriptor,
				schemas,
			)
			if (schema !== undefined) inputSchemas.set(route.operation, schema)
		}
		if (descriptors.size !== operations.length) {
			throw new TypeError(
				'REST operation exposure does not match its route graph',
			)
		}
		bound = { core, inputSchemas, statuses }
	}

	const transport: RestOperationTransport = immutableRecord({
		operations,
		/** Executes one already matched operation route through Core's canonical Runtime. */
		execute: async (
			context: RequestContext,
			route: RestPluginOperationRouteDefinition,
			request: Request,
			limits: RestReadLimits,
		): Promise<unknown> => {
			if (bound === undefined || !operations.includes(route)) {
				throw new TypeError(
					'REST operation route is not owned by this transport',
				)
			}
			const { core, inputSchemas } = bound
			const body = await readCustomBody(
				request,
				limits,
				invalidRestOperation,
				true,
			)
			// The envelope is exactly `{ input }`; nothing else can steer execution.
			if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'input')) {
				throw invalidRestOperation(
					undefined,
					restErrorDetails('body', 'must be exactly { "input": value }'),
				)
			}
			request.signal.throwIfAborted()
			const schema = inputSchemas.get(route.operation)
			return await core.execute({
				context,
				input:
					schema === undefined
						? body.input
						: decodeParameter('input', invalidRestOperation, () =>
								decodeRestMutationData(
									schema,
									body.input,
									'create',
									'nested',
									invalidRestOperation,
								),
							),
				operation: route.operation,
				version: route.operationVersion,
			})
		},
		/** Reads the statically validated status for one declared public plugin error. */
		statusFor: (operation: string, code: string): number | undefined =>
			bound?.statuses.get(operation)?.[code],
	})
	return [transport, bind]
}

const mutationBodyKeys = new Set(['include', 'input', 'select'])
const mutationKey = (schema: string, command: string): string =>
	`${schema}\0${command}`

/** @internal Creates an unbound schema-mutation facade during setup. */
export const createRestSchemaMutationTransport = (
	routes: readonly RestSchemaMutationRouteDefinition[],
): RestBoundTransport<
	RestSchemaMutationTransport,
	ApplicationSchemaMutationTransport<typeof restProtocol>
> => {
	const mutations = immutableArray(routes)
	let bound:
		| Readonly<{
				core: ApplicationSchemaMutationTransport<typeof restProtocol>
				descriptors: ReadonlyMap<string, ExposedSchemaMutationTransportBinding>
				statuses: StatusMaps
		  }>
		| undefined

	const bind = (
		core: ApplicationSchemaMutationTransport<typeof restProtocol>,
	) => {
		if (bound !== undefined) return
		const exposed = new Map(
			core.mutations.map((item) => [
				mutationKey(item.schema, item.command),
				item,
			]),
		)
		const descriptors = new Map<string, ExposedSchemaMutationTransportBinding>()
		const statuses = new Map<string, Readonly<Record<string, number>>>()
		for (const route of mutations) {
			const key = mutationKey(route.schema, route.command)
			const descriptor = exposed.get(key)
			if (
				descriptor?.mutation !== route.mutation ||
				descriptor.version !== route.mutationVersion ||
				descriptor.authority !== 'request'
			) {
				throw new TypeError(
					`REST schema mutation route ${route.schema}.${route.command} has no exact Core exposure`,
				)
			}
			descriptors.set(key, descriptor)
			statuses.set(
				descriptor.mutation,
				descriptor.bound
					? readRestErrorStatusMap(
							descriptor.metadata,
							descriptor.errors,
							descriptor.mutation,
						)
					: defaultErrorStatuses(descriptor.errors),
			)
		}
		if (descriptors.size !== mutations.length) {
			throw new TypeError(
				'REST schema mutation exposure does not match its route graph',
			)
		}
		bound = { core, descriptors, statuses }
	}

	const transport: RestSchemaMutationTransport = immutableRecord({
		mutations,
		execute: async (
			context: RequestContext,
			route: RestSchemaMutationRouteDefinition,
			id: string,
			request: Request,
			schema: SchemaDefinition,
			limits: RestReadLimits,
		): Promise<unknown> => {
			const binding = bound?.descriptors.get(
				mutationKey(route.schema, route.command),
			)
			if (
				bound === undefined ||
				binding === undefined ||
				!mutations.includes(route)
			) {
				throw new TypeError(
					'REST schema mutation route is not owned by this transport',
				)
			}
			const { core } = bound
			const body = await readCustomBody(
				request,
				limits,
				invalidRestMutation,
				isUuidV7(id),
			)
			const unknownKey = Object.keys(body).find(
				(key) => !mutationBodyKeys.has(key),
			)
			if (unknownKey !== undefined) {
				throw invalidRestMutation(
					undefined,
					restErrorDetails(
						unknownKey,
						'is not accepted; the body takes input, select and include',
					),
				)
			}
			request.signal.throwIfAborted()
			// Core keeps ownership of the target, selection, policy, and result.
			return await core.execute({
				binding,
				context,
				id,
				...(Object.hasOwn(body, 'include')
					? {
							include: decodeParameter('include', invalidRestMutation, () =>
								decodeRestInclude(schema, body.include, limits),
							),
						}
					: {}),
				input: body.input,
				schema,
				...(Object.hasOwn(body, 'select') ? { select: body.select } : {}),
			})
		},
		statusFor: (operation: string, code: string): number | undefined =>
			bound?.statuses.get(operation)?.[code],
	})
	return [transport, bind]
}
