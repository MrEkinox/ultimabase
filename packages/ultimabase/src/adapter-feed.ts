// What a committed write changed, as an adapter sends it (D-154).

/**
 * What a committed write changed (D-154): `ids` is absent when they were
 * more than `feedIds`, `fields` when they were every field or longer than
 * `feedFields`. A delete's links go with its rows, unlisted. How changes
 * group into entries and calls is the adapter's.
 */
export type Changed =
	| {
			readonly kind: 'insert' | 'update'
			readonly model: string
			readonly ids?: readonly string[]
			/** The fields an update set, `updatedAt` included. */
			readonly fields?: readonly string[]
	  }
	| {
			readonly kind: 'delete'
			readonly model: string
			readonly ids?: readonly string[]
			/**
			 * The stored `one` keys of the rows, each in the order of `ids`,
			 * `null` without a target; absent with `ids` (D-196).
			 */
			readonly keys?: { readonly [field: string]: readonly (string | null)[] }
	  }
	| {
			readonly kind: 'link' | 'unlink'
			readonly model: string
			/** A `many` relation facing a `many`. */
			readonly field: string
			/** The model's id, then the target's. */
			readonly pairs?: readonly (readonly [string, string])[]
	  }

/** The most ids or pairs a change lists (D-154). */
export const feedIds = 1000
/** The longest list of fields, as JSON, an update lists (D-154). */
export const feedFields = 1500

/** Where an adapter sends the changes each commit makes, on any server. */
export type Feed = {
	readonly changed: (changes: readonly Changed[]) => void
	/** Changes may stop coming, as when a listener loses its connection (D-332). */
	readonly lost: () => void
	/** Changes may have been lost, as when a listener reconnects. */
	readonly missed: () => void
}
