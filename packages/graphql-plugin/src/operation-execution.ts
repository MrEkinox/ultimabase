import type {
	ApplicationOperationTransport,
	ApplicationOperationTransportPlan,
	ExposedOperationTransportBinding,
	RequestContext,
} from '@ultimabase/core'

interface GraphqlOperationExecutionState {
	core: ApplicationOperationTransport | undefined
	operations: ReadonlyMap<string, ExposedOperationTransportBinding>
	plan: ApplicationOperationTransportPlan
}

const executionStates = new WeakMap<
	GraphqlOperationExecution,
	GraphqlOperationExecutionState
>()

/** Retains the static plan while Core remains the only operation executor. */
export class GraphqlOperationExecution {
	constructor(plan: ApplicationOperationTransportPlan) {
		executionStates.set(this, {
			core: undefined,
			operations: new Map(plan.operations.map((item) => [item.name, item])),
			plan,
		})
		Object.freeze(this)
	}

	bind(core: ApplicationOperationTransport): void {
		const state = executionStates.get(this)
		if (state === undefined) {
			throw new TypeError('GraphQL operation execution is unavailable')
		}
		if (state.core !== undefined) {
			throw new TypeError('GraphQL operation execution is already bound')
		}
		if (
			core.transport !== state.plan.transport ||
			core.operations.length !== state.plan.operations.length ||
			core.operations.some(
				(item, index) => item !== state.plan.operations[index],
			)
		) {
			throw new TypeError(
				'GraphQL operation execution does not match its static plan',
			)
		}
		state.core = core
	}

	async execute(
		context: RequestContext,
		operation: ExposedOperationTransportBinding,
		input: unknown,
	): Promise<unknown> {
		const state = executionStates.get(this)
		if (
			state?.core === undefined ||
			state.operations.get(operation.name) !== operation
		) {
			throw new TypeError('GraphQL operation execution is unavailable')
		}
		return state.core.execute({
			context,
			input,
			operation: operation.name,
			version: operation.version,
		})
	}

	dispose(): void {
		// A disposed bridge cannot execute or bind again, including an unbound one.
		executionStates.delete(this)
	}
}
