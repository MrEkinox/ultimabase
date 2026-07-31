// Runtime re-exports the neutral binding facade while retaining execution ownership.
export { BoundQuery } from '@ultimabase/query'
export type { InferQueryResult } from '@ultimabase/query'
export { RequestContext, requestSources } from './context/request-context.js'
export type {
	BuiltInRequestSource,
	RequestContextOptions,
	RequestMetadata,
} from './context/request-context.js'
