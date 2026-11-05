// What a live read sends (D-154), which a transport writes in its own shape,
// and its handle.
import type { Logger, ModelQueries, Row } from 'ultimabase'

/** A row that left the window, `gone` when deleted or no longer readable. */
export type Removal = { readonly remove: string; readonly gone: boolean }
/** A row placed after another, first with `after: null`. */
export type Upsert = { readonly upsert: Row; readonly after: string | null }

/** What a live read sends; `revision` grows by one per message. */
export type LiveMessage =
	| {
			readonly kind: 'reset'
			readonly revision: number
			readonly rows: readonly Row[]
			readonly hasMore: boolean
			readonly totalCount?: number
	  }
	| {
			readonly kind: 'changes'
			readonly revision: number
			readonly changes: readonly (Removal | Upsert)[]
			/** Only when it changed. */
			readonly hasMore?: boolean
			/** Only when it changed. */
			readonly totalCount?: number
			/** The ids of the first and last rows shown, only when they changed. */
			readonly ends?: readonly string[]
	  }
	| {
			readonly kind: 'row'
			readonly revision: number
			readonly row: Row | null
	  }
	| {
			readonly kind: 'value'
			readonly revision: number
			/** A live function's whole result. */
			readonly value: unknown
	  }
	/** With the error a live function failed with, which closed it. */
	| { readonly kind: 'closed'; readonly error?: unknown }

/** A live read's handle. */
export interface LiveHandle {
	/** Shows `more` rows after the last; a list over its limit is refused. */
	grow(this: void, more: number): Promise<void>
	/** Sends the whole window again, as after messages were dropped. */
	resend(this: void): Promise<void>
	close(this: void): void
}

/** What a live read follows, and whom it tells. */
export type Spec = {
	readonly model: string
	readonly queries: ModelQueries
	/** The read's own `where`, which `totalCount` counts. */
	readonly where: unknown
	/** Its `select`, `include` or `omit`, each level's `id` selected. */
	readonly shape: { readonly [key: string]: unknown }
	readonly totalCount: boolean
	readonly row: boolean
	/** The rows it follows at most; past them it has no next page (D-252). */
	readonly limit: number
	readonly send: (message: LiveMessage) => void
	readonly logger: Logger
}
