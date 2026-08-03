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
// Application assembly installs every mandatory stage from plugin-owned declarations.
export { createFrameworkEngine } from './application/create-framework-engine.js'
export type { CreateFrameworkEngineOptions } from './application/create-framework-engine.js'
// UltimaBase is the regular class-based facade over Core composition and Runtime execution.
export { UltimaBase } from './application/ultima-base.js'
export type { UltimaBaseOptions } from './application/ultima-base.js'
// Applications create request-bound engines; opaque grants protect master construction.
export { FrameworkEngine, RequestEngine } from './engine/framework-engine.js'
export type {
	FrameworkEngineOptions,
	RequestTransactionHandler,
} from './engine/framework-engine.js'
// Database plugins implement this neutral boundary without leaking their query builders.
export {
	databaseAdapterServiceToken,
	databasePointerCapability,
	databasePointerCapabilityVersion,
	databaseRelationCapability,
	databaseRelationCapabilityVersion,
} from './database/contracts.js'
export type {
	DatabaseAdapterCapabilities,
	DatabaseConstraintNode,
	DatabaseConstraintPayload,
	DatabaseConstraintPayloadObject,
	DatabaseAdapter,
	DatabaseCreateMaterialization,
	DatabaseDeleteMaterialization,
	DatabaseLogicalRecord,
	DatabaseMutationLogicalRecord,
	DatabaseMutationMaterialization,
	DatabaseMutationOperationAst,
	DatabaseMutationOperationKind,
	DatabaseObjectRecord,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationOutcome,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabasePointerCapability,
	DatabaseRelationCapability,
	DatabaseRowFilterNode,
	DatabaseTransactionAdapter,
	DatabaseUpdateMaterialization,
	ImmutableDatabaseConstraintPayload,
	PreparedDatabaseOperation,
} from './database/contracts.js'
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
// Hook factories remain functions while Core retains plugin contribution ownership.
export {
	afterOperation,
	beforeOperation,
	postCommitEvent,
} from './hooks/definitions.js'
export type {
	AfterOperationDefinition,
	AfterOperationHandler,
	AfterOperationOptions,
	AfterOperationResult,
	BeforeOperationDefinition,
	BeforeOperationHandler,
	BeforeOperationOptions,
	BeforeOperationResult,
	PostCommitEventDefinition,
	PostCommitEventHandler,
	PostCommitEventOptions,
	RuntimeContributionDefinitionUnion,
	RuntimeHookOperationInput,
	RuntimeHookResultInput,
} from './hooks/definitions.js'
export { onEvent } from './hooks/events.js'
export type {
	HookEvent,
	HookEventDefinition,
	HookEventHandler,
	HookEventHandlerInput,
	OnEventOptions,
} from './hooks/events.js'
export { hookDiagnosticsObserverServiceToken } from './hooks/diagnostics.js'
export type {
	HookDiagnosticEvent,
	HookDiagnosticOwner,
	HookDiagnosticPhase,
	HookDiagnosticsObserver,
	HookDiagnosticTarget,
} from './hooks/diagnostics.js'
export { createRuntimeHookStages } from './hooks/stages.js'
export type { RuntimeHookStages } from './hooks/stages.js'
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
	RuntimeEnforcementEvaluationStage,
	RuntimeEnforcementOperationResult,
	RuntimeEnforcementOperationStage,
	RuntimeEnforcementReevaluationStage,
	RuntimeEnforcementResultStage,
	RuntimeEnforcementStageInput,
	RuntimeEnforcementStages,
	RuntimeMutationOutcomeTransformStage,
	RuntimeMutationOutcomeStageInput,
	RuntimeNativeHookStages,
	RuntimeOperationGuardStage,
	RuntimeOperationStageInput,
	RuntimeOperationTransformStage,
	RuntimePipelineRequest,
	RuntimePipelineStages,
	RuntimePreparedMutationEffectStage,
	RuntimePreparedMutationStageInput,
	RuntimeResultEffectStage,
	RuntimeResultStageInput,
	RuntimeResultTransformStage,
} from './pipeline/contracts.js'
export { createRuntimeValidationStage } from './validation/runtime-validation.js'
export type { UuidV7Generator } from './validation/identifier-generator.js'
export type { RuntimeValidationOptions } from './validation/runtime-validation.js'
