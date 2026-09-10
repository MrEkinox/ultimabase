import { isDeepStrictEqual } from 'node:util'

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
	selectedCore: Map<
		ExposedSchemaMutationTransportBinding,
		ExposedSchemaMutationTransportBinding
	>
}

const states = new WeakMap<
	GraphqlSchemaMutationExecution,
	GraphqlSchemaMutationExecutionState
>()

const sameOwner = (
	left: ExposedSchemaMutationTransportBinding['owner'],
	right: ExposedSchemaMutationTransportBinding['owner'],
): boolean =>
	left.pluginId === right.pluginId &&
	left.instanceId === right.instanceId &&
	left.version === right.version

const sameDescriptor = (
	left: ExposedSchemaMutationTransportBinding,
	right: ExposedSchemaMutationTransportBinding,
): boolean =>
	left.authority === right.authority &&
	left.command === right.command &&
	left.effect === right.effect &&
	left.mutation === right.mutation &&
	left.returning === right.returning &&
	left.schema === right.schema &&
	left.version === right.version &&
	sameOwner(left.owner, right.owner) &&
	isDeepStrictEqual(left.errors, right.errors) &&
	isDeepStrictEqual(left.metadata, right.metadata)

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
			selectedCore: new Map(),
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
			core.mutations.some(
				(item, index) =>
					!sameDescriptor(item, state.plan.mutations[index] ?? item),
			)
		) {
			throw new TypeError(
				'GraphQL schema mutation execution does not match its static plan',
			)
		}
		const selectedCore = new Map(
			[...state.selected].map((descriptor) => {
				const index = state.plan.mutations.indexOf(descriptor)
				const executable = core.mutations[index]
				if (executable === undefined) {
					throw new TypeError(
						'GraphQL schema mutation has no exact Core exposure',
					)
				}
				return [descriptor, executable]
			}),
		)
		state.core = core
		state.selectedCore = selectedCore
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
		const executable = state.selectedCore.get(options.descriptor)
		if (executable === undefined) {
			throw new TypeError('GraphQL schema mutation execution is unavailable')
		}
		return state.core.execute({
			binding: executable,
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
		state.selectedCore.clear()
	}
}
