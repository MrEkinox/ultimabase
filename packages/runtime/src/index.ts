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
// Applications create request-bound engines; trusted master construction stays internal.
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
// The engine assembles these neutral stages once and every transport uses them.
export { RuntimePipeline } from './pipeline/runtime-pipeline.js'
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
