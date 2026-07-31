import type { Brand, MaybePromise } from '@ultimabase/shared'

import type { QueryOrderDirection } from '../ast/contracts.js'

/** Identifies the current payload shape without exposing its wire encoding. */
export const queryCursorVersion = 1

/** Prevents validated opaque cursor strings from being confused with arbitrary text. */
export type QueryCursor = Brand<string, 'QueryCursor'>

/** Associates one normalized order term with its last returned value. */
export interface QueryCursorOrderValue<TFieldName extends string = string> {
	readonly field: TFieldName
	readonly direction: QueryOrderDirection
	readonly value: unknown
}

/** Carries the minimum versioned state required to resume one ordered query. */
export interface QueryCursorPayload<TFieldName extends string = string> {
	readonly version: typeof queryCursorVersion
	readonly className: string
	readonly ordering: readonly QueryCursorOrderValue<TFieldName>[]
}

/**
 * Protects cursor payloads behind an application-provided integrity boundary.
 *
 * Implementations must authenticate sealed values and reject modified tokens;
 * reversible encoding without integrity protection does not satisfy this contract.
 */
export interface QueryCursorCodec {
	readonly seal: (payload: QueryCursorPayload) => MaybePromise<string>
	readonly unseal: (cursor: string) => MaybePromise<unknown>
}
