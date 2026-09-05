import type {
	ApplicationOperationTransport,
	RequestContext,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

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

const readStatusMap = (
	metadata: unknown,
	errors: readonly string[],
	operation: string,
): Readonly<Record<string, number>> => {
	if (
		!isPlainRecord(metadata) ||
		Object.keys(metadata).length !== 1 ||
		!Object.hasOwn(metadata, 'errors') ||
		!isPlainRecord(metadata.errors)
	) {
		throw new TypeError(
			`REST binding for operation ${operation} must declare exact error status metadata`,
		)
	}
	const statuses = metadata.errors
	const keys = Object.keys(statuses)
	if (
		keys.length !== errors.length ||
		errors.some((code) => !Object.hasOwn(statuses, code))
	) {
		throw new TypeError(
			`REST binding for operation ${operation} must map every declared public error`,
		)
	}
	for (const [code, status] of Object.entries(statuses)) {
		if (
			!errors.includes(code) ||
			typeof status !== 'number' ||
			!Number.isSafeInteger(status) ||
			status < 400 ||
			status > 599
		) {
			throw new TypeError(
				`REST binding for operation ${operation} has an invalid status for ${code}`,
			)
		}
	}
	return immutableRecord(statuses as Readonly<Record<string, number>>)
}

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
				readStatusMap(descriptor.metadata, descriptor.errors, route.operation),
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
