// A check a table's snapshot holds (snapshot.ts), and a plan writes (plan-keys.ts).

/**
 * A column among `values`, each element of a list's (D-127); a `within`
 * relation's column, empty while its `parent` column is (D-235); or a
 * `oneOf`'s `kinds` columns, one of them set, at most one when `optional`
 * (D-247); or a list's number of values (D-281).
 */
export type Check =
	| {
			readonly column: string
			readonly values: string[]
			readonly list?: true
	  }
	| { readonly column: string; readonly parent: string }
	| { readonly column: string; readonly min: number; readonly max?: number }
	| {
			readonly field: string
			readonly kinds: string[]
			readonly optional?: true
	  }
