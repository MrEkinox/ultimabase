// Runtime re-exports the neutral binding facade while retaining execution ownership.
export { BoundQuery } from '@ultimabase/query'
export type { InferQueryResult } from '@ultimabase/query'
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
export type {
	UltimaBaseOptions,
	UltimaBaseQuery,
} from './application/ultima-base.js'
// Applications create request-bound engines; opaque grants protect master construction.
export { FrameworkEngine, RequestEngine } from './engine/framework-engine.js'
export type {
	FrameworkEngineOptions,
	RequestTransactionHandler,
} from './engine/framework-engine.js'
// Database plugins implement this neutral boundary without leaking their query builders.
export { databaseAdapterServiceToken } from './database/contracts.js'
export type {
	DatabaseAccessConstraintNode,
	DatabaseAdapter,
	DatabaseObjectRecord,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
} from './database/contracts.js'
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
} from './hooks/definitions.js'
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
	RuntimeAccessConstraintStage,
	RuntimeAccessStageInput,
	RuntimeFieldPermissionStage,
	RuntimeFieldPermissionStageResult,
	RuntimeOperationGuardStage,
	RuntimeOperationStageInput,
	RuntimeOperationTransformStage,
	RuntimePipelineRequest,
	RuntimePipelineStages,
	RuntimeResultEffectStage,
	RuntimeResultStageInput,
	RuntimeResultTransformStage,
} from './pipeline/contracts.js'
export { createRuntimeValidationStage } from './validation/runtime-validation.js'
export type { UuidV7Generator } from './validation/identifier-generator.js'
export type { RuntimeValidationOptions } from './validation/runtime-validation.js'
