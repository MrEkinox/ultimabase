import {
	afterOperation,
	applicationOperationTransportPlanningCapability,
	applicationRequestExecutionCapability,
	beforeOperation,
	definePlugin,
	guard,
	postCommitEvent,
	requireCapability,
	provideRuntimeBehavior,
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
	provideRuntimeObserver,
	replaceRuntime,
	RuntimePipeline,
	Schema,
	type RuntimeExecutorFactory,
	type RuntimeFinalMutationGuardStage,
	type ApplicationOperationTransportPlanner,
	type ApplicationRequestExecutor,
} from '../../src/index.js'

const schema = Schema.define({
	className: 'PackedRuntimeCapability',
	fields: (field) => ({ title: field.string() }),
})

const interceptor = provideRuntimeInterceptor({
	contributionId: 'typed-interceptor',
	create: () => ({
		value: afterOperation({
			handler: ({ operation, result }) => {
				const exactOperation: 'find-many' = operation.kind
				const correlatedRows: readonly unknown[] = result
				// @ts-expect-error A find-many result cannot be treated as one scalar value.
				const scalarResult: string = result

				void exactOperation
				void correlatedRows
				void scalarResult
				return { result }
			},
			operations: ['find-many'],
			schema,
		}),
	}),
})

const constraint = provideRuntimeConstraint({
	contributionId: 'typed-constraint',
	create: () => ({
		value: guard({
			handler: ({ operation }) => {
				const exactOperation: 'create-one' = operation.kind
				void exactOperation
			},
			operations: ['create-one'],
			schema,
		}),
	}),
})

const observer = provideRuntimeObserver({
	contributionId: 'typed-observer',
	create: () => ({
		value: postCommitEvent({
			handler: ({ operation }) => {
				const exactOperation: 'create-one' = operation.kind
				void exactOperation
			},
			operations: ['create-one'],
			schema,
		}),
	}),
})

const finalMutationGuard: RuntimeFinalMutationGuardStage = ({ operation }) => {
	const mutationKind:
		| 'create-many'
		| 'create-one'
		| 'delete-many'
		| 'delete-one'
		| 'update-many'
		| 'update-one'
		| 'upsert-many'
		| 'upsert-one' = operation.kind
	void mutationKind
}

const behavior = provideRuntimeBehavior({
	contributionId: 'typed-final-mutation-guard',
	create: () => ({ value: { guardMutationInput: finalMutationGuard } }),
})

const replacement = replaceRuntime({
	contributionId: 'typed-replacement',
	create: () => ({
		value: (stages) => new RuntimePipeline(stages),
	}),
})

const requestExecution = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)
const operationPlanning = requireCapability(
	applicationOperationTransportPlanningCapability,
	'^1.0.0',
)

definePlugin({
	pluginId: 'fixture.packed-runtime-capabilities',
	version: '0.0.0',
	core: '^0.0.0',
	privileges: [
		{ name: 'runtime:constrain', reason: 'Exercises the packed facade.' },
		{ name: 'runtime:intercept', reason: 'Exercises the packed facade.' },
		{ name: 'runtime:observe', reason: 'Exercises the packed facade.' },
		{ name: 'runtime:replace', reason: 'Exercises the packed facade.' },
	],
	capabilities: {
		requires: [requestExecution, operationPlanning],
		provides: [behavior, interceptor, constraint, observer],
		replaces: [replacement],
	},
})

beforeOperation({ handler: () => undefined })
type InspectedExecutorFactory =
	/* hover:runtime-executor */ RuntimeExecutorFactory
type InspectedFinalMutationGuard =
	/* hover:runtime-final-mutation-guard */ RuntimeFinalMutationGuardStage
type InspectedApplicationRequestExecutor =
	/* hover:application-request-executor */ ApplicationRequestExecutor
type InspectedApplicationOperationTransportPlanner =
	/* hover:application-operation-transport-planner */ ApplicationOperationTransportPlanner

void (undefined as unknown as InspectedExecutorFactory)
void (undefined as unknown as InspectedFinalMutationGuard)
void (undefined as unknown as InspectedApplicationRequestExecutor)
void (undefined as unknown as InspectedApplicationOperationTransportPlanner)
