import {
	applicationOperationTransportPlanningCapability,
	applicationRequestExecutionCapability,
	guard,
	preparedOperation,
	provideRuntimeBehavior,
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
	UltimaBase,
	type RuntimeFinalMutationGuardStage,
	type ApplicationOperationTransportPlanner,
	type ApplicationRequestExecutor,
} from '../../src/index.js'
import { plugin, requireCapability } from '../../src/plugin.js'

const schema = UltimaBase.Schema.define({
	className: 'PackedRuntimeCapability',
	fields: (field) => ({ title: field.string() }),
})

const interceptor = provideRuntimeInterceptor({
	contributionId: 'typed-interceptor',
	create: () => ({
		value: preparedOperation({
			handler: ({ operation, target }) => {
				const exactOperation: 'update-one' = operation.kind
				const lockedTarget: object = target
				// @ts-expect-error A locked update target cannot be treated as one scalar value.
				const scalarTarget: string = target

				void exactOperation
				void lockedTarget
				void scalarTarget
				return { operation }
			},
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

plugin({
	id: 'fixture.packed-runtime-capabilities',
	version: '0.0.0',
	core: '^0.0.0',
	permissions: {
		'runtime:constrain': 'Exercises the packed facade.',
		'runtime:intercept': 'Exercises the packed facade.',
	},
	contributions: [
		behavior,
		interceptor,
		constraint,
		requestExecution,
		operationPlanning,
	],
})

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

// ADR-0264 removes stage contributions from source and packed authoring contracts.
// @ts-expect-error Only the supported logical interceptors remain.
void core.runtimePipelineStage
// @ts-expect-error Former low-level plugin stage names are no longer public.
type RemovedStageName = core.RuntimePipelineStageName
// @ts-expect-error Former low-level plugin stage definitions are no longer public.
type RemovedStageDefinition = core.RuntimePipelineStageDefinition
// @ts-expect-error Former low-level plugin stage handlers are no longer public.
type RemovedStageHandler = core.RuntimePipelineStageHandler<'commit'>
// @ts-expect-error Former low-level plugin stage options are no longer public.
type RemovedStageOptions = core.RuntimePipelineStageOptions<'commit'>
void (undefined as unknown as RemovedStageName)
void (undefined as unknown as RemovedStageDefinition)
void (undefined as unknown as RemovedStageHandler)
void (undefined as unknown as RemovedStageOptions)
provideRuntimeInterceptor({
	contributionId: 'removed-stage',
	create: () => ({
		// @ts-expect-error A stage-shaped object is not a logical interceptor definition.
		value: { stage: 'commit' },
	}),
})

// ADR-0265 removes marker-based selection; Typegen still generates directly.
// @ts-expect-error The emitter marker is no longer a public capability.
void core.typegenEmitterCapability
// @ts-expect-error The inert marker interface has no remaining public contract.
type RemovedTypegenEmitter = core.TypegenEmitterCapability
void (undefined as unknown as RemovedTypegenEmitter)

// ADR-0266 removes migration-only authoring while physical metadata remains.
// @ts-expect-error Migration-only runtime exports are retired.
void core.adapterMigrationCapability
// @ts-expect-error Migration-only runtime exports are retired.
void core.adapterUpgradeIntent
// @ts-expect-error Migration-only runtime exports are retired.
void core.planAdapterMigrations
// @ts-expect-error Migration-only type contracts are retired.
type RemovedMigration0 = core.AdapterMigrationSupport
void (undefined as unknown as RemovedMigration0)
// @ts-expect-error Migration-only type contracts are retired.
type RemovedMigration1 = core.AdapterMigrationPlan
void (undefined as unknown as RemovedMigration1)
// @ts-expect-error Migration-only type contracts are retired.
type RemovedMigration2 = core.AdapterUpgradeIntentPayload
void (undefined as unknown as RemovedMigration2)
// @ts-expect-error Migration-only type contracts are retired.
type RemovedMigration3 = core.AdapterUpgradeTarget
void (undefined as unknown as RemovedMigration3)
// @ts-expect-error Migration-only type contracts are retired.
type RemovedMigration4 = core.OrphanedAdapterContribution
void (undefined as unknown as RemovedMigration4)
// @ts-expect-error Migration-only type contracts are retired.
type RemovedMigration5 = core.PlannedAdapterUpgrade
void (undefined as unknown as RemovedMigration5)
// @ts-expect-error Adapter support families were removed with their bridges (ADR-0289).
const removedAdapterFamily: core.AdapterCapabilityFamily = 'migration'
// @ts-expect-error Adapter contribution families were removed with their bridges (ADR-0289).
const removedContributionFamily: core.AdapterContributionFamily = 'migration'
// @ts-expect-error Privilege facades are no longer public metadata (ADR-0289).
const removedMigrationFacade: core.PluginPrivilegeFacade = 'migration'
void [removedAdapterFamily, removedContributionFamily, removedMigrationFacade]

// ADR-0289 removes kernel extension points that only tests consumed.
// @ts-expect-error Generic before-operation interceptors were removed.
void core.beforeOperation
// @ts-expect-error Generic after-operation interceptors were removed.
void core.afterOperation
// @ts-expect-error Input field restrictions were removed; protected policies narrow input.
void core.restrictInput
// @ts-expect-error Selection restrictions were removed; protected policies narrow selection.
void core.restrictSelection
// @ts-expect-error Output restrictions were removed; protected policies restrict results.
void core.restrictOutput
// @ts-expect-error Constraint definitions were removed; protected policies narrow rows.
void core.constraint
// @ts-expect-error Runtime protocol tokens are internal to their exact provider facades.
void core.runtimeInterceptorCapability
// @ts-expect-error Runtime protocol tokens are internal to their exact provider facades.
void core.runtimeConstraintCapability
// @ts-expect-error Removed interceptor contracts are no longer public.
type RemovedInterceptor0 = core.BeforeOperationDefinition
void (undefined as unknown as RemovedInterceptor0)
// @ts-expect-error Removed interceptor contracts are no longer public.
type RemovedInterceptor1 = core.AfterOperationDefinition
void (undefined as unknown as RemovedInterceptor1)
// @ts-expect-error Removed restriction contracts are no longer public.
type RemovedRestriction0 = core.InputRestrictionDefinition
void (undefined as unknown as RemovedRestriction0)
// @ts-expect-error Removed restriction contracts are no longer public.
type RemovedRestriction1 = core.OutputRestrictionDefinition
void (undefined as unknown as RemovedRestriction1)
// @ts-expect-error Removed constraint contracts are no longer public.
type RemovedConstraint0 = core.ConstraintDefinition
void (undefined as unknown as RemovedConstraint0)
// @ts-expect-error Separate schema-mutation bindings were removed; contributeSchemaMutation binds.
void core.contributeSchemaMutationBinding
// @ts-expect-error Privilege metadata stays internal to Core's policy reports.
void core.pluginPrivilegeMetadata
// @ts-expect-error Environment-claim metadata stays internal to Core's policy reports.
void core.pluginEnvironmentClaimMetadata
// @ts-expect-error The environment-claim vocabulary list stays internal.
void core.pluginEnvironmentClaims
// @ts-expect-error Adapter support protocols had no production consumer.
void core.adapterSupport
// @ts-expect-error Adapter support protocols had no production consumer.
void core.provideAdapterCapability
// @ts-expect-error Adapter support protocols had no production consumer.
void core.adapterConstraintCapability
// @ts-expect-error Adapter support protocols had no production consumer.
void core.adapterPersistencePlanCapability
// @ts-expect-error Adapter support protocols had no production consumer.
void core.adapterPhysicalSchemaCapability
// @ts-expect-error Adapter support protocols had no production consumer.
void core.adapterValueStorageCapability
// @ts-expect-error Adapter contribution bridges had no production consumer.
void core.defineAdapterContributionCapability
// @ts-expect-error Adapter contribution bridges had no production consumer.
void core.provideAdapterContribution
// @ts-expect-error Raw adapter leases had no production consumer.
void core.defineAdapterRawCapability
// @ts-expect-error Raw adapter leases had no production consumer.
void core.provideAdapterRawCapability
// @ts-expect-error Raw adapter leases had no production consumer.
type RemovedRawAccess = core.AdapterAccess
void (undefined as unknown as RemovedRawAccess)
// @ts-expect-error The raw adapter privilege was removed with raw leases.
const removedRawPrivilege: core.PluginPrivilege = 'adapter:raw'
void removedRawPrivilege
// @ts-expect-error Opaque database constraint nodes had no production producer.
void core.databaseConstraint
// @ts-expect-error Opaque database constraint nodes had no production producer.
type RemovedConstraintNode = core.DatabaseConstraintNode
void (undefined as unknown as RemovedConstraintNode)
// @ts-expect-error Adapter constraint compilers had no production consumer.
void core.defineDatabaseConstraintCompiler
// @ts-expect-error Adapter constraint compilers had no production consumer.
type RemovedCompilerRegistry = core.PluginConstraintCompilerRegistry
void (undefined as unknown as RemovedCompilerRegistry)
// @ts-expect-error The adapter consumption privilege was removed with compilers.
const removedConsumePrivilege: core.PluginPrivilege = 'adapter:consume'
void removedConsumePrivilege
// @ts-expect-error Portable schema constraints had no production consumer.
void core.defineSchemaConstraint
// @ts-expect-error Portable schema constraints had no production consumer.
void core.addSchemaConstraint
// @ts-expect-error Portable schema constraints had no production consumer.
type RemovedSchemaConstraint = core.SchemaConstraintDefinition
void (undefined as unknown as RemovedSchemaConstraint)
