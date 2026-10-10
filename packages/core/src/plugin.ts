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
