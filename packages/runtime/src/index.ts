// Runtime re-exports the neutral binding facade while retaining execution ownership.
export { BoundQuery } from '@ultimabase/query'
export type { InferQueryResult } from '@ultimabase/query'
export { RequestContext, requestSources } from './context/request-context.js'
export type {
	BuiltInRequestSource,
	RequestContextOptions,
	RequestMetadata,
} from './context/request-context.js'
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
