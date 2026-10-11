import type {
	ApplicationSchemaMutationTransport,
	ApplicationSchemaMutationTransportPlan,
	ExposedSchemaMutationTransportBinding,
	SchemaDefinition,
} from '@ultimabase/core'

import { matchesGraphqlPlan } from './operation-execution.js'
import type { graphqlProtocol } from './protocol.js'
import type { RequestContext } from '@ultimabase/core/plugin'

type Transport = ApplicationSchemaMutationTransport<typeof graphqlProtocol>
type Plan = ApplicationSchemaMutationTransportPlan<typeof graphqlProtocol>

/** Retains selected schema mutations while Core owns every executable callback. */
export class GraphqlSchemaMutationExecution {
	// Disposal clears the plan and the selection, which share one lifetime.
	#plan: Plan | undefined
	#core: Transport | undefined
	readonly #selected = new Set<ExposedSchemaMutationTransportBinding>()

	constructor(plan: Plan) {
		this.#plan = plan
		Object.freeze(this)
	}

	/** @internal Records only descriptors that produced a public GraphQL field. */
	select(descriptor: ExposedSchemaMutationTransportBinding): void {
		if (!this.#plan?.mutations.includes(descriptor)) {
			throw new TypeError('GraphQL schema mutation selection is unavailable')
		}
		this.#selected.add(descriptor)
	}

	bind(core: Transport): void {
		const plan = this.#plan
		if (plan === undefined) {
			throw new TypeError('GraphQL schema mutation execution is unavailable')
		}
		if (this.#core !== undefined) {
			throw new TypeError('GraphQL schema mutation execution is already bound')
		}
		if (
			!matchesGraphqlPlan(
				{ transport: core.transport, items: core.mutations },
				{ transport: plan.transport, items: plan.mutations },
			)
		) {
			throw new TypeError(
				'GraphQL schema mutation execution does not match its static plan',
			)
		}
		this.#core = core
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
		const core = this.#plan === undefined ? undefined : this.#core
		if (core === undefined || !this.#selected.has(options.descriptor)) {
			throw new TypeError('GraphQL schema mutation execution is unavailable')
		}
		return core.execute({
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
		this.#plan = undefined
		this.#core = undefined
		this.#selected.clear()
	}
}
