/**
 * Plugin-author entry of UltimaBase Core (`@ultimabase/core/plugin`, ADR-0311).
 * Applications import `@ultimabase/core`; transports and other plugins import
 * the authoring helpers they need from here.
 */
export {
	decodeQueryCursor,
	encodeQueryCursor,
	type QueryCursorOrderBy,
} from './query/clauses/cursor.js'
export type { QueryPosition } from './query/query/input-contracts.js'
export { RequestCapability } from './access/request/capability.js'
export { RequestContextValue } from './access/request/context-value.js'
export type {
	RequestContextValueSnapshot,
	RequestContextValueType,
} from './access/request/context-value.js'
export {
	RequestContext,
	requestSources,
} from './runtime/context/request-context.js'
export type {
	BuiltInRequestSource,
	RequestContextOptions,
	RequestMetadata,
} from './runtime/context/request-context.js'
export { RequestEngine } from './runtime/engine/request-engine.js'
export type { RequestTransactionHandler } from './runtime/engine/request-engine.js'
export {
	anonymous,
	authorizeMasterKey,
	withContext,
} from './runtime/application/plugin-authority.js'
export { WhereBuilder } from './query/filters/where.js'
export { QueryBuilder } from './query/query/query.js'
