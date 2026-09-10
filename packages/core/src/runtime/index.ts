export { RequestContext, requestSources } from './context/request-context.js'
export type {
	BuiltInRequestSource,
	RequestContextOptions,
	RequestMetadata,
} from './context/request-context.js'
// Contextual access is optional; transports should still inject request engines explicitly.
export {
	getCurrentApplication,
	getCurrentApplicationEngine,
	getCurrentEngine,
	getCurrentFrameworkContext,
	getCurrentRequest,
	runWithRequestEngine,
} from './context/active-framework-context.js'
export type { ActiveFrameworkContext } from './context/active-framework-context.js'
export { runOutsideRequestEngineScope } from './context/active-framework-storage.js'
// Application assembly installs every mandatory stage from plugin-owned declarations.
export { createFrameworkEngine } from './application/create-framework-engine.js'
export type { CreateFrameworkEngineOptions } from './application/create-framework-engine.js'
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
	ApplicationSchemaMutationKind,
	ApplicationSchemaMutationRequest,
	ApplicationSchemaMutationResult,
} from './application/application-schema-mutation-execution.js'
export {
	canonicalRuntimeExecutorTarget,
	provideRuntimeConstraint,
	provideRuntimeBehavior,
	provideRuntimeInterceptor,
	provideRuntimeObserver,
	replaceRuntime,
	runtimeConstraintCapability,
	runtimeBehaviorCapability,
	runtimeExecutorCapability,
	runtimeInterceptorCapability,
	runtimeObserverCapability,
} from './capabilities.js'
export type {
	RuntimeConstraintDefinition,
	RuntimeExecutorFactory,
	RuntimeInterceptorDefinition,
	RuntimeObserverDefinition,
} from './capabilities.js'
// UltimaBase is the regular class-based facade over Core composition and Runtime execution.
export { UltimaBase } from './application/ultima-base.js'
export type { UltimaBaseOptions } from './application/ultima-base.js'
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
export { FrameworkEngine, RequestEngine } from './engine/framework-engine.js'
export { TrackedExecutionLifetime } from './engine/tracked-execution-lifetime.js'
export type {
	FrameworkEngineOptions,
	RequestTransactionHandler,
} from './engine/framework-engine.js'
// Adapter protocols negotiate portable support while concrete bridges retain infrastructure ownership.
export * from './adapters/index.js'
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
	DatabaseConstraintNode,
	DatabaseConstraintPayload,
	DatabaseConstraintPayloadObject,
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
	ImmutableDatabaseConstraintPayload,
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
	operationHandler,
	operationTransportBinding,
	operationWireCodec,
	provideOperationHandler,
	provideOperationTransportBinding,
} from './plugin-operations/index.js'
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
	PluginOperationHandlerDefinition,
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
	PersistencePlanRewriterDefinition,
} from './persistence/index.js'
// Enforcement factories let permission and community plugins share one monotonic boundary.
export {
	constraint,
	databaseConstraint,
	guard,
	restrictInput,
	restrictOutput,
	restrictSelection,
} from './enforcement/definitions.js'
export type {
	ConstraintDefinition,
	ConstraintOptions,
	EnforcementDefinition,
	EnforcementDefinitionUnion,
	GuardDefinition,
	GuardOptions,
	InputRestrictionDefinition,
	InputRestrictionOptions,
	OutputRestrictionDefinition,
	OutputRestrictionOptions,
	SelectionRestrictionDefinition,
	SelectionRestrictionOptions,
} from './enforcement/definitions.js'
export type {
	EnforcementContributionKind,
	EnforcementConstraintHandler,
	EnforcementFieldBoundary,
	EnforcementFieldRestrictionHandler,
	EnforcementGuardHandler,
	EnforcementOperation,
	EnforcementOperationInput,
	EnforcementOutputInput,
	EnforcementOutputRestrictionHandler,
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
// Generic operation interceptors retain plugin contribution ownership.
export {
	afterOperation,
	beforeOperation,
	postCommitEvent,
	preparedOperation,
} from './contributions/definitions.js'
export type {
	AfterOperationDefinition,
	AfterOperationHandler,
	AfterOperationOptions,
	AfterOperationResult,
	BeforeOperationDefinition,
	BeforeOperationHandler,
	BeforeOperationOptions,
	PostCommitEventDefinition,
	PostCommitEventHandler,
	PostCommitEventOptions,
	PreparedOperationDefinition,
	PreparedOperationHandler,
	PreparedOperationOptions,
	RuntimeContributionDefinitionUnion,
	RuntimeInterceptorOperationInput,
	RuntimePreparedOperationInput,
	RuntimeInterceptorResultInput,
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
export { runtimePipelineStage } from './pipeline/definitions.js'
export type {
	RuntimePipelineStageDefinition,
	RuntimePipelineStageHandler,
	RuntimePipelineStageName,
	RuntimePipelineStageOptions,
} from './pipeline/definitions.js'
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
	RuntimeDatabaseResultStageInput,
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
} from './pipeline/contracts.js'
export { createRuntimeBehaviorBoundaries } from './behaviors/boundaries.js'
export type { RuntimeBehaviorBoundaries } from './behaviors/boundaries.js'
export { getOperationSchema } from './operations/schema.js'
export {
	collectOperationFieldInputs,
	collectRecordFieldValues,
	readRuntimeFieldValuePath,
} from './operations/field-values.js'
export type {
	RuntimeFieldInputValue,
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
} from './transactions/transaction-execution-storage.js'
export {
	createRuntimeValidationStage,
	snapshotRuntimeResultRecord,
} from './validation/runtime-validation.js'
export { createFinalMutationValidationStage } from './validation/final-mutation-validation.js'
export type { UuidV7Generator } from './validation/identifier-generator.js'
export type { RuntimeValidationOptions } from './validation/runtime-validation.js'
