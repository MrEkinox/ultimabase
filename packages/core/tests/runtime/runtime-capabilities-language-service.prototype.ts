import {
	afterOperation,
	applicationOperationTransportPlanningCapability,
	applicationRequestExecutionCapability,
	beforeOperation,
	definePlugin,
	guard,
	requireCapability,
	provideRuntimeBehavior,
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
	Schema,
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
	],
	capabilities: {
		requires: [requestExecution, operationPlanning],
		provides: [behavior, interceptor, constraint],
	},
})

beforeOperation({ handler: () => undefined })
type InspectedFinalMutationGuard =
	/* hover:runtime-final-mutation-guard */ RuntimeFinalMutationGuardStage
type InspectedApplicationRequestExecutor =
	/* hover:application-request-executor */ ApplicationRequestExecutor
type InspectedApplicationOperationTransportPlanner =
	/* hover:application-operation-transport-planner */ ApplicationOperationTransportPlanner

void (undefined as unknown as InspectedFinalMutationGuard)
void (undefined as unknown as InspectedApplicationRequestExecutor)
void (undefined as unknown as InspectedApplicationOperationTransportPlanner)

// Removed powers must stay absent from both source and packed declarations.
import * as core from '../../src/index.js'
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.canonicalRuntimeExecutorTarget
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.canonicalSchemaCompilerTarget
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.decorateCapability
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.replaceCapability
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.replaceRuntime
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.replaceSchemaCompiler
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.runtimeExecutorCapability
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.runtimeObserverCapability
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.provideRuntimeObserver
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.postCommitEvent
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.schemaCompilerCapability
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.schemaCompilerProtocolVersion
// @ts-expect-error The unused kernel API was removed by ADR-0259.
void core.isSchemaCompilerArtifactReference
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed0 = core.CapabilityContributionTarget
void (undefined as unknown as Removed0)
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed1 = core.CapabilityDecoratorDeclaration
void (undefined as unknown as Removed1)
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed4 = core.CapabilityReplacementDeclaration
void (undefined as unknown as Removed4)
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed3 = core.CapabilityProviderChainInspection
void (undefined as unknown as Removed3)
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed2 = core.CapabilityDecoratorInspection
void (undefined as unknown as Removed2)
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed7 = core.RuntimeExecutorFactory
void (undefined as unknown as Removed7)
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed8 = core.RuntimeObserverDefinition
void (undefined as unknown as Removed8)
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed5 = core.PostCommitEventDefinition
void (undefined as unknown as Removed5)
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed9 = core.SchemaCompilerImplementation
void (undefined as unknown as Removed9)
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed10 = core.SchemaCompilerInput
void (undefined as unknown as Removed10)
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed11 = core.SchemaCompilerOutput
void (undefined as unknown as Removed11)
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed12 = core.SchemaCompilerProvenance
void (undefined as unknown as Removed12)
// @ts-expect-error The unused kernel contract was removed by ADR-0259.
type Removed6 = core.ReplaceSchemaCompilerOptions
void (undefined as unknown as Removed6)
