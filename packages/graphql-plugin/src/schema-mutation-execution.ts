import type {
	ApplicationSchemaMutationTransport,
	ApplicationSchemaMutationTransportPlan,
	ExposedSchemaMutationTransportBinding,
	RequestContext,
	SchemaDefinition,
} from '@ultimabase/core'

import type { graphqlProtocol } from './protocol.js'

interface GraphqlSchemaMutationExecutionState {
	core: ApplicationSchemaMutationTransport<typeof graphqlProtocol> | undefined
	disposed: boolean
	plan: ApplicationSchemaMutationTransportPlan<typeof graphqlProtocol>
	selected: Set<ExposedSchemaMutationTransportBinding>
}

const states = new WeakMap<
	GraphqlSchemaMutationExecution,
	GraphqlSchemaMutationExecutionState
>()

/** Retains selected schema mutations while Core owns every executable callback. */
export class GraphqlSchemaMutationExecution {
	constructor(
		plan: ApplicationSchemaMutationTransportPlan<typeof graphqlProtocol>,
	) {
		states.set(this, {
			core: undefined,
			disposed: false,
			plan,
			selected: new Set(),
		})
		Object.freeze(this)
	}

	/** @internal Records only descriptors that produced a public GraphQL field. */
	select(descriptor: ExposedSchemaMutationTransportBinding): void {
		const state = states.get(this)
		if (
			state === undefined ||
			state.disposed ||
			!state.plan.mutations.includes(descriptor)
		) {
			throw new TypeError('GraphQL schema mutation selection is unavailable')
		}
		state.selected.add(descriptor)
	}

	bind(core: ApplicationSchemaMutationTransport<typeof graphqlProtocol>): void {
		const state = states.get(this)
		if (state === undefined || state.disposed) {
			throw new TypeError('GraphQL schema mutation execution is unavailable')
		}
		if (state.core !== undefined) {
			throw new TypeError('GraphQL schema mutation execution is already bound')
		}
		if (
			core.transport !== state.plan.transport ||
			core.mutations.length !== state.plan.mutations.length ||
			core.mutations.some((item, index) => item !== state.plan.mutations[index])
		) {
			throw new TypeError(
				'GraphQL schema mutation execution does not match its static plan',
			)
		}

		state.core = core
	}

	async execute(options: {
		readonly context: RequestContext
		readonly descriptor: ExposedSchemaMutationTransportBinding
		readonly id: string
		readonly include?: unknown
		readonly input: unknown
		readonly schema: SchemaDefinition
		readonly select?: unknown
	}): Promise<unknown> {
		const state = states.get(this)
		if (state?.core === undefined || !state.selected.has(options.descriptor)) {
			throw new TypeError('GraphQL schema mutation execution is unavailable')
		}

		return state.core.execute({
			binding: options.descriptor,
			context: options.context,
			id: options.id,
			...(options.include === undefined ? {} : { include: options.include }),
			input: options.input,
			schema: options.schema,
			...(options.select === undefined ? {} : { select: options.select }),
		})
	}

	dispose(): void {
		const state = states.get(this)
		if (state === undefined || state.disposed) return
		state.core = undefined
		state.disposed = true
		state.selected.clear()
	}
}
