import type {
	ApplicationOperationTransport,
	ApplicationOperationTransportPlan,
	ExposedOperationTransportBinding,
	RequestContext,
} from '@ultimabase/core'

/** @internal Proves Core exposed exactly the descriptors planned at setup. */
export const matchesGraphqlPlan = <TItem>(
	core: Readonly<{ transport: unknown; items: readonly TItem[] }>,
	plan: Readonly<{ transport: unknown; items: readonly TItem[] }>,
): boolean =>
	core.transport === plan.transport &&
	core.items.length === plan.items.length &&
	core.items.every((item, index) => item === plan.items[index])

/** Retains the static plan while Core remains the only operation executor. */
export class GraphqlOperationExecution {
	// Disposal clears the plan, so a disposed bridge can neither bind nor execute.
	#plan: ApplicationOperationTransportPlan | undefined
	#core: ApplicationOperationTransport | undefined
	readonly #operations: ReadonlyMap<string, ExposedOperationTransportBinding>

	constructor(plan: ApplicationOperationTransportPlan) {
		this.#plan = plan
		this.#operations = new Map(plan.operations.map((item) => [item.name, item]))
		Object.freeze(this)
	}

	bind(core: ApplicationOperationTransport): void {
		const plan = this.#plan
		if (plan === undefined) {
			throw new TypeError('GraphQL operation execution is unavailable')
		}
		if (this.#core !== undefined) {
			throw new TypeError('GraphQL operation execution is already bound')
		}
		if (
			!matchesGraphqlPlan(
				{ transport: core.transport, items: core.operations },
				{ transport: plan.transport, items: plan.operations },
			)
		) {
			throw new TypeError(
				'GraphQL operation execution does not match its static plan',
			)
		}
		this.#core = core
	}

	async execute(
		context: RequestContext,
		operation: ExposedOperationTransportBinding,
		input: unknown,
	): Promise<unknown> {
		const core = this.#plan === undefined ? undefined : this.#core
		if (
			core === undefined ||
			this.#operations.get(operation.name) !== operation
		) {
			throw new TypeError('GraphQL operation execution is unavailable')
		}
		return core.execute({
			context,
			input,
			operation: operation.name,
			version: operation.version,
		})
	}

	dispose(): void {
		this.#plan = undefined
		this.#core = undefined
	}
}
