// A relation's options (D-37, D-54, D-151, D-220, D-236, D-237, D-240).
import type { Described } from './described.ts'
import type { DefaultFunction } from './fields.ts'

/** What shapes a `one` relation (D-37, D-54), or a `one` view (D-240). */
export type OneOptions = Described & (StoredOne | OneView)

type OneView = {
	/**
	 * A view: read-only, the one row of this one-to-many `many` of the model
	 * that its filter keeps (D-240).
	 */
	readonly from: string
	readonly optional?: undefined
	readonly default?: undefined
	readonly onDelete?: undefined
	readonly inverse?: undefined
	readonly dbName?: undefined
	readonly within?: undefined
}

type StoredOne = {
	readonly from?: undefined
	readonly optional?: boolean
	/** The target's id (D-53). */
	readonly default?:
		{ readonly id: string } | DefaultFunction<{ readonly id: string }>
	readonly onDelete?: 'cascade' | 'restrict' | 'setNull'
	/**
	 * The target's `one` on the other side of a one-to-one; this side then
	 * stores no key. Without it, this side stores the key, and its target has
	 * no field back unless one of the target's relations names it (D-237).
	 */
	readonly inverse?: string
	readonly dbName?: string
	/**
	 * Its target shares a parent with the row (D-220): with `'project'`, the
	 * target's `project` is the row's; with `{ campaign: 'id' }`, the
	 * target's `campaign` is the row itself.
	 */
	readonly within?: string | { readonly [field: string]: string }
}
// `setNull` empties the relation, which only an optional one may be (D-54).
// The message is an object: a literal would empty the whole options type.
export type OneCheck<O> = O extends { readonly optional: true }
	? unknown
	: O extends { readonly onDelete: 'setNull' }
		? {
				readonly onDelete: {
					readonly error: 'setNull needs an optional relation'
				}
			}
		: unknown

export type ManyOptions = Described &
	(
		| {
				/** The target's relation on the other side (D-237). */
				readonly inverse: string
				readonly from?: undefined
				/**
				 * Facing a `many`, every row it links has the row's `project`
				 * with `'project'` (D-236).
				 */
				readonly within?: string
		  }
		| {
				/**
				 * A view: read-only, on the link of this other `many` of the
				 * model, its rows those its filter keeps (D-151).
				 */
				readonly from: string
				readonly inverse?: undefined
		  }
	)
