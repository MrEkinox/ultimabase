import type {
	ApplicationSchemaMutationTransport,
	ExposedSchemaMutationTransportBinding,
	RequestContext,
	SchemaDefinition,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { readRestErrorStatusMap } from './binding-metadata.js'
import {
	invalidRestMutation,
	restMutationErrorCodes,
	RestMutationNormalizationError,
} from './mutation-errors.js'
import { readRestJsonBody, type RestJsonBodyErrors } from './read-body.js'
import { isUuidV7 } from './read-values.js'
import { decodeRestInclude, type RestReadLimits } from './reads.js'
import type {
	restProtocol,
	RestSchemaMutationRouteDefinition,
} from './routes.js'

const bodyErrors: RestJsonBodyErrors = immutableRecord({
	bodyTooLarge: () =>
		new RestMutationNormalizationError(restMutationErrorCodes.bodyTooLarge),
	invalidInput: invalidRestMutation,
	unsupportedMediaType: () =>
		new RestMutationNormalizationError(
			restMutationErrorCodes.unsupportedMediaType,
		),
})
const bodyKeys = new Set(['include', 'input', 'select'])
const routeKey = (route: RestSchemaMutationRouteDefinition): string =>
	`${route.schema}\0${route.command}`

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

interface SchemaMutationTransportState {
	core?: ApplicationSchemaMutationTransport<typeof restProtocol>
	descriptors: ReadonlyMap<string, ExposedSchemaMutationTransportBinding>
	statuses: ReadonlyMap<string, Readonly<Record<string, number>>>
}

const states = new WeakMap<
	CoreRestSchemaMutationTransport,
	SchemaMutationTransportState
>()

class CoreRestSchemaMutationTransport implements RestSchemaMutationTransport {
	readonly mutations: readonly RestSchemaMutationRouteDefinition[]

	constructor(mutations: readonly RestSchemaMutationRouteDefinition[]) {
		this.mutations = Object.freeze([...mutations])
		states.set(this, { descriptors: new Map(), statuses: new Map() })
		Object.freeze(this)
	}

	bind(core: ApplicationSchemaMutationTransport<typeof restProtocol>): void {
		const state = states.get(this)
		if (state === undefined)
			throw new TypeError('Unknown REST schema mutation transport')
		if (state.core !== undefined) return
		const descriptors = new Map(
			core.mutations.map((descriptor) => [
				`${descriptor.schema}\0${descriptor.command}`,
				descriptor,
			]),
		)
		const selected = new Map<string, ExposedSchemaMutationTransportBinding>()
		const statuses = new Map<string, Readonly<Record<string, number>>>()
		for (const route of this.mutations) {
			const key = routeKey(route)
			const descriptor = descriptors.get(key)
			if (
				descriptor?.mutation !== route.mutation ||
				descriptor.version !== route.mutationVersion ||
				descriptor.authority !== 'request'
			) {
				throw new TypeError(
					`REST schema mutation route ${route.schema}.${route.command} has no exact Core exposure`,
				)
			}
			selected.set(key, descriptor)
			statuses.set(
				descriptor.mutation,
				readRestErrorStatusMap(
					descriptor.metadata,
					descriptor.errors,
					descriptor.mutation,
				),
			)
		}
		if (selected.size !== this.mutations.length) {
			throw new TypeError(
				'REST schema mutation exposure does not match its route graph',
			)
		}
		state.core = core
		state.descriptors = selected
		state.statuses = statuses
	}

	async execute(
		context: RequestContext,
		route: RestSchemaMutationRouteDefinition,
		id: string,
		request: Request,
		schema: SchemaDefinition,
		limits: RestReadLimits,
	): Promise<unknown> {
		const state = states.get(this)
		const descriptor = state?.descriptors.get(routeKey(route))
		if (
			state?.core === undefined ||
			descriptor === undefined ||
			!this.mutations.includes(route)
		) {
			throw new TypeError(
				'REST schema mutation route is not owned by this transport',
			)
		}
		request.signal.throwIfAborted()
		if (
			request.method !== 'POST' ||
			new URL(request.url).search !== '' ||
			!isUuidV7(id)
		) {
			throw invalidRestMutation()
		}
		const body = await readRestJsonBody(request, limits.bodyBytes, bodyErrors)
		if (!isPlainRecord(body)) throw invalidRestMutation()
		for (const key of Object.keys(body)) {
			if (!bodyKeys.has(key)) throw invalidRestMutation()
		}
		request.signal.throwIfAborted()
		return await state.core.execute({
			binding: descriptor,
			context,
			id,
			...(Object.hasOwn(body, 'include')
				? { include: decodeRestInclude(schema, body.include, limits) }
				: {}),
			input: body.input,
			schema,
			...(Object.hasOwn(body, 'select') ? { select: body.select } : {}),
		})
	}

	statusFor(operation: string, code: string): number | undefined {
		return states.get(this)?.statuses.get(operation)?.[code]
	}
}

/** @internal Creates an unbound REST facade during setup. */
export const createRestSchemaMutationTransport = (
	mutations: readonly RestSchemaMutationRouteDefinition[],
): RestSchemaMutationTransport => new CoreRestSchemaMutationTransport(mutations)

/** @internal Late-binds the exact Core allowlist before serving requests. */
export const bindRestSchemaMutationTransport = (
	transport: RestSchemaMutationTransport,
	core: ApplicationSchemaMutationTransport<typeof restProtocol>,
): void => {
	if (!(transport instanceof CoreRestSchemaMutationTransport)) {
		throw new TypeError(
			'REST schema mutation transport must use the official facade',
		)
	}
	transport.bind(core)
}
