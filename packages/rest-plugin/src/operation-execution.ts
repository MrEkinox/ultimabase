import type {
	ApplicationOperationTransport,
	RequestContext,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { readRestErrorStatusMap } from './binding-metadata.js'
import {
	invalidRestOperation,
	restOperationErrorCodes,
	RestOperationNormalizationError,
} from './operation-errors.js'
import { readRestJsonBody, type RestJsonBodyErrors } from './read-body.js'
import type { RestReadLimits } from './reads.js'
import type {
	restProtocol,
	RestPluginOperationRouteDefinition,
} from './routes.js'

const operationBodyErrors: RestJsonBodyErrors = immutableRecord({
	bodyTooLarge: () =>
		new RestOperationNormalizationError(restOperationErrorCodes.bodyTooLarge),
	invalidInput: invalidRestOperation,
	unsupportedMediaType: () =>
		new RestOperationNormalizationError(
			restOperationErrorCodes.unsupportedMediaType,
		),
})

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

interface RestOperationTransportState {
	core?: ApplicationOperationTransport<typeof restProtocol>
	statuses: ReadonlyMap<string, Readonly<Record<string, number>>>
}

const transportStates = new WeakMap<
	CoreRestOperationTransport,
	RestOperationTransportState
>()

class CoreRestOperationTransport implements RestOperationTransport {
	readonly operations: readonly RestPluginOperationRouteDefinition[]

	constructor(operations: readonly RestPluginOperationRouteDefinition[]) {
		this.operations = Object.freeze([...operations])
		transportStates.set(this, { statuses: new Map() })
		Object.freeze(this)
	}

	bind(core: ApplicationOperationTransport<typeof restProtocol>): void {
		const state = transportStates.get(this)
		if (state === undefined)
			throw new TypeError('Unknown REST operation transport')
		if (state.core !== undefined) return
		const descriptors = new Map(
			core.operations.map((item) => [item.name, item]),
		)
		const statuses = new Map<string, Readonly<Record<string, number>>>()
		for (const route of this.operations) {
			const descriptor = descriptors.get(route.operation)
			if (descriptor?.version !== route.operationVersion) {
				throw new TypeError(
					`REST operation route ${route.operation} has no exact Core exposure`,
				)
			}
			statuses.set(
				route.operation,
				readRestErrorStatusMap(
					descriptor.metadata,
					descriptor.errors,
					route.operation,
				),
			)
		}
		if (descriptors.size !== this.operations.length) {
			throw new TypeError(
				'REST operation exposure does not match its route graph',
			)
		}
		state.core = core
		state.statuses = statuses
	}

	/** Executes one already matched operation route through Core's canonical Runtime. */
	async execute(
		context: RequestContext,
		route: RestPluginOperationRouteDefinition,
		request: Request,
		limits: RestReadLimits,
	): Promise<unknown> {
		const state = transportStates.get(this)
		if (state?.core === undefined || !this.operations.includes(route)) {
			throw new TypeError('REST operation route is not owned by this transport')
		}
		try {
			request.signal.throwIfAborted()
			if (request.method !== 'POST' || new URL(request.url).search !== '') {
				throw invalidRestOperation()
			}
			const body = await readRestJsonBody(
				request,
				limits.bodyBytes,
				operationBodyErrors,
			)
			if (
				!isPlainRecord(body) ||
				Object.keys(body).length !== 1 ||
				!Object.hasOwn(body, 'input')
			) {
				throw invalidRestOperation()
			}
			request.signal.throwIfAborted()
			return await state.core.execute({
				context,
				input: body.input,
				operation: route.operation,
				version: route.operationVersion,
			})
		} catch (error) {
			if (error instanceof RestOperationNormalizationError) throw error
			if (request.signal.aborted) throw error
			throw error
		}
	}

	/** Reads the statically validated status for one declared public plugin error. */
	statusFor(operation: string, code: string): number | undefined {
		return transportStates.get(this)?.statuses.get(operation)?.[code]
	}
}

/** @internal Creates an unbound facade during plugin setup. */
export const createRestOperationTransport = (
	operations: readonly RestPluginOperationRouteDefinition[],
): RestOperationTransport => new CoreRestOperationTransport(operations)

/** @internal Late-binds Core after the application engine exists. */
export const bindRestOperationTransport = (
	transport: RestOperationTransport,
	core: ApplicationOperationTransport<typeof restProtocol>,
): void => {
	if (!(transport instanceof CoreRestOperationTransport)) {
		throw new TypeError('REST operation transport must use the official facade')
	}
	transport.bind(core)
}
