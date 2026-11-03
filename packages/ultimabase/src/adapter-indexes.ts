// A partial unique index's rows in the adapter contract (D-73, D-215).

/** A value a partial unique index compares a field with (D-215). */
export type IndexValue = string | number | boolean | Date | null

/** A partial unique index's rows: each field equals a value, or not (D-215). */
export type IndexWhere = {
	readonly [field: string]:
		{ readonly equals: IndexValue } | { readonly not: IndexValue }
}
