export { RequestContext, requestSources } from './context/request-context.js'
export type {
	BuiltInRequestSource,
	RequestContextOptions,
	RequestMetadata,
} from './context/request-context.js'
// Contextual access is optional; transports should still inject request engines explicitly.
export {
	getCurrentEngine,
	getCurrentRequest,
	runOutsideRequestEngineScope,
	runWithRequestEngine,
} from './context/active-framework-context.js'
export { getCurrentUltimaBase } from './context/current-ultima-base.js'
export { throwIfOperationCancelled } from './cancellation/operation-cancellation.js'
export { applicationRequestExecutionCapability } from './application/application-request-execution.js'
export type {
	ApplicationMasterKeyVerificationOptions,
	ApplicationRequestExecutor,
} from './application/application-request-execution.js'
export { applicationOperationTransportPlanningCapability } from './application/application-operation-transport-planning.js'
export type {
	ApplicationOperationTransportPlan,
	ApplicationOperationTransportPlanner,
	OperationTransportPlanningOptions,
} from './application/application-operation-transport-planning.js'
export type {
	ApplicationSchemaMutationTransportPlan,
	SchemaMutationTransportPlanningOptions,
} from './application/schema-mutation-transport-planning.js'
export { applicationSchemaMutationSurfaceCapability } from './application/application-schema-mutation-surface.js'
export type {
	ApplicationSchemaMutationDescriptor,
	ApplicationSchemaMutationSurface,
} from './application/application-schema-mutation-surface.js'
export type {
	ApplicationSchemaMutationKind,
	ApplicationSchemaMutationRequest,
	ApplicationSchemaMutationResult,
} from './application/application-schema-mutation-execution.js'
export {
	provideRuntimeConstraint,
	provideRuntimeBehavior,
	provideRuntimeInterceptor,
	runtimeBehaviorCapability,
} from './capabilities.js'
export type {
	RuntimeConstraintDefinition,
	RuntimeInterceptorDefinition,
} from './capabilities.js'
// UltimaBase is the regular class-based facade over Core composition and Runtime execution.
export { UltimaBase } from './application/ultima-base.js'
export type {
	CompiledApplication,
	UltimaBaseInstanceOptions,
} from './application/ultima-base-contracts.js'
export type { ConfiguredUltimaBaseFactory } from './application/configured-application-factory.js'
export type {
	CheckedSchemas,
	SchemaRegistrationCheck,
	SchemaRegistrationChecks,
	SchemaRegistrationError,
} from './application/schema-registration-checks.js'
export {
	ApplicationModelHandle,
	ApplicationOperationHandle,
	ApplicationSchemaHandleBase,
} from '../application/application-handles.js'
export type {
	ApplicationContributionOwner,
	ApplicationModelHandleFor,
	ApplicationOperationHandleForName,
	ApplicationSchemaHandle,
	ApplicationSchemaHandleForName,
	PluginOperationEnvelope,
	PluginOperationEnvelopeTarget,
} from '../application/application-handles.js'
export type {
	ApplicationModelSchemaMutationMethod,
	ApplicationSchemaMutationMethod,
	PluginSchemaMutationModelInput,
	PluginSchemaMutationResult,
	PluginSchemaMutationSchemaInput,
} from '../application/application-schema-mutations.js'
export { requireCurrentRequestRoleResolver } from './context/subject-capabilities.js'
// Applications create request-bound engines; opaque grants protect master construction.
export { RequestEngine } from './engine/request-engine.js'
export { TrackedExecutionLifetime } from './engine/tracked-execution-lifetime.js'
export type { RequestTransactionHandler } from './engine/request-engine.js'
// Database plugins implement this neutral boundary without leaking their query builders.
export {
	databaseAdapterCapability,
	databaseInclusionCapability,
	databaseInclusionCapabilityVersion,
	databasePointerCapability,
	databasePointerCapabilityVersion,
	databasePersistencePlanCapability,
	databaseRelationCapability,
	databaseRelationCapabilityVersion,
	databaseRelationPredicateCapability,
	databaseRelationPredicateCapabilityVersion,
	databasePluginFieldStructuralContainsCapability,
	databasePluginFieldStructuralContainsCapabilityVersion,
} from './database/contracts.js'
export type {
	DatabaseAdapterCapabilities,
	DatabasePluginFieldStructuralContainsCapability,
	DatabaseAdapter,
	DatabaseCreateMaterialization,
	DatabaseDeleteMaterialization,
	DatabaseInclusionCapability,
	DatabaseInclusionPlan,
	DatabaseLogicalRecord,
	DatabaseMutationLogicalRecord,
	DatabaseMutationMaterialization,
	DatabaseMutationMaterializationSource,
	DatabaseMutationOperationAst,
	DatabaseMutationOperationKind,
	DatabaseObjectRecord,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationOutcome,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabasePointerCapability,
	DatabasePersistencePlanCapability,
	DatabaseRelationCapability,
	DatabaseRelationPredicateCapability,
	DatabaseRelationPredicateScope,
	DatabaseRelationReference,
	DatabaseRelationScope,
	DatabaseRowFilterNode,
	DatabaseTransactionAdapter,
	DatabaseUpdateMaterialization,
	PreparedDatabaseOperation,
	PreparedDatabaseOperationExecution,
} from './database/contracts.js'
// Persistence rewriters can change physical delete statements without changing logical semantics.
export {
	databasePersistencePlanVersion,
	createDatabasePersistencePlan,
	persistencePlanRewriter,
	persistencePlanRewriterCapability,
	providePersistencePlanRewriter,
	rewriteDeletePersistencePlan,
} from './persistence/index.js'
// Custom operations execute through owner-bound handlers and explicit wire bindings.
export {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
} from './plugin-operations/index.js'
export {
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
} from './schema-mutations/index.js'
export type {
	ApplicationSchemaMutationTransport,
	ExposedSchemaMutationTransportBinding,
	SchemaMutationTransportExposureOptions,
	SchemaMutationTransportRequest,
} from './schema-mutations/transport.js'
export type {
	PluginSchemaMutationEffectResult,
	PluginSchemaMutationHandler,
	PluginSchemaMutationHandlerInput,
	PluginSchemaMutationOperationAst,
	PluginSchemaMutationTarget,
	PluginSchemaMutationUpdateEffect,
	SchemaMutationTransportBindingDefinition,
	SchemaMutationTransportBindingMetadata,
	SchemaMutationTransportWireInput,
	SchemaMutationWireCodec,
} from './schema-mutations/index.js'
export type {
	ApplicationOperationTransport,
	ExposedOperationTransportBinding,
	OperationTransportBindingDefinition,
	OperationTransportBindingMetadata,
	OperationTransportExposureOptions,
	OperationTransportProtocol,
	OperationTransportRequest,
	OperationTransportWireInput,
	OperationTransportWireResult,
	OperationWireCodec,
	PluginOperationExecutionTarget,
	PluginOperationHandler,
	PluginOperationHandlerInput,
	PublicTransportProtectionOptions,
	PublicTransportProtectionWarning,
} from './plugin-operations/index.js'
export type {
	DatabasePersistencePlan,
	DatabasePersistencePlanKind,
	DatabasePersistenceProvenance,
	DatabasePersistenceReturning,
	DatabasePersistenceRewriteInput,
	DatabasePersistenceTarget,
	PersistenceLogicalOperationAst,
	PersistencePlanOperationKind,
	PersistencePlanRewriterDefinition,
} from './persistence/index.js'
// Enforcement factories let permission and community plugins share one monotonic boundary.
export { guard } from './enforcement/definitions.js'
export type {
	EnforcementDefinition,
	GuardDefinition,
	GuardOptions,
} from './enforcement/definitions.js'
export type {
	EnforcementGuardHandler,
	EnforcementOperation,
	EnforcementOperationInput,
} from './enforcement/contracts.js'
export { protectedPolicy } from './enforcement/protected-policy.js'
export type {
	ProtectedPolicyDefinition,
	ProtectedPolicyEffects,
	ProtectedPolicyEvaluate,
	ProtectedPolicyMutationOutcomeGuard,
	ProtectedPolicyOptions,
	ProtectedPolicyPreparedMutationGuard,
	ProtectedPolicyReevaluate,
	ProtectedPolicyRelationGuard,
	ProtectedPolicyResultRestriction,
} from './enforcement/protected-policy.js'
// The prepared-operation interceptor retains plugin contribution ownership.
export { preparedOperation } from './contributions/definitions.js'
export type {
	PreparedOperationDefinition,
	PreparedOperationHandler,
	PreparedOperationOptions,
	RuntimeInterceptorOperationInput,
	RuntimePreparedOperationInput,
} from './contributions/definitions.js'
// Raw keys become framework-owned opaque grants before request elevation.
export { MasterAuthority, MasterKeyGrant } from './master/master-authority.js'
export type {
	MasterAccessEvent,
	MasterAuthorityOptions,
	MasterKeyDefinition,
} from './master/master-authority.js'
// The engine assembles these neutral stages once and every transport uses them.
export { RuntimePipeline } from './pipeline/runtime-pipeline.js'
export type {
	RuntimeBehaviorStages,
	RuntimeEnforcementEvaluationStage,
	RuntimeEnforcementOperationResult,
	RuntimeEnforcementOperationStage,
	RuntimeEnforcementReevaluationStage,
	RuntimeEnforcementResultStage,
	RuntimeEnforcementSelectionResultStage,
	RuntimeEnforcementStageInput,
	RuntimeEnforcementStages,
	RuntimeFinalMutationGuardStage,
	RuntimeDatabaseResult,
	RuntimeDatabaseResultStageInput,
	RuntimeLogicalMutationOperationAst,
	RuntimeLogicalOperationAst,
	RuntimeLogicalOperationKind,
	RuntimeMutationLogicalRecord,
	RuntimeMutationOutcome,
	RuntimeMutationOutcomeTransformStage,
	RuntimeMutationOutcomeStageInput,
	RuntimeProjectedDatabaseResultStageInput,
	RuntimeProjectedDatabaseResultTransformStage,
	RuntimeMaterializedResultStageInput,
	RuntimeMaterializedResultTransformStage,
	RuntimeMutationRevalidationStage,
	RuntimeMutationRevalidationStageInput,
	RuntimeOperationGuardStage,
	RuntimeOperationResult,
	RuntimeOperationStageInput,
	RuntimeOperationTransformStage,
	RuntimePipelineRequest,
	RuntimePipelineStages,
	RuntimePreparedMutationEffectStage,
	RuntimePreparedMutationTransformStage,
	RuntimePreparedMutationStageInput,
	RuntimeRelationEnforcementStageInput,
	RuntimeResultEffectStage,
	RuntimeResultStageInput,
	RuntimeResultTransformStage,
	RuntimeSchemaMutationOutcome,
} from './pipeline/contracts.js'
export { createRuntimeBehaviorBoundaries } from './behaviors/validation-boundaries.js'
export { readRuntimePreparedMutationRecords } from './behaviors/prepared-target-boundary.js'
export type { RuntimeBehaviorBoundaries } from './behaviors/validation-boundaries.js'
export type { RuntimePreparedMutationRecords } from './behaviors/prepared-target-boundary.js'
export { getOperationSchema } from './operations/schema.js'
export {
	collectOperationFieldInputs,
	collectRecordFieldValues,
	readRuntimeFieldValuePath,
	transformOperationFieldInputs,
} from './operations/field-values.js'
export type {
	RuntimeFieldInputValue,
	RuntimeFieldInputVisitor,
	RuntimeFieldValue,
	RuntimeFieldValuePathSegment,
	RuntimeFieldVisitOrder,
} from './operations/field-values.js'
export {
	readOperationQueries,
	readOperationResultSelection,
} from './operations/queries.js'
export { readRuntimeIncludedPointerValue } from './operations/model-metadata.js'
export {
	deferCurrentTransactionEffect,
	getCurrentTransactionId,
} from './transactions/run-transaction.js'
export {
	createRuntimeValidationStage,
	snapshotRuntimeResultRecord,
} from './validation/runtime-validation.js'
export { createFinalMutationValidationStage } from './validation/final-mutation-validation.js'
export type { UuidV7Generator } from './validation/identifier-generator.js'
export type { RuntimeValidationOptions } from './validation/runtime-validation.js'
