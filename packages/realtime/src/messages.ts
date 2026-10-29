// What a live read sends (D-154); a transport writes it in its own shape.
import type { Row } from 'ultimabase'

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
	  }
	| {
			readonly kind: 'row'
			readonly revision: number
			readonly row: Row | null
	  }
	| { readonly kind: 'closed' }
