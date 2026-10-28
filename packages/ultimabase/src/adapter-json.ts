// A json value's path condition in the adapter contract (D-73, D-149).

/** The operators a `Condition` on a json value adds. */
export type JsonCondition = {
	/**
	 * A json value's operators test the value at this path into it (D-149):
	 * a key, or an array's index as PostgreSQL's `#>` reads it. A path the
	 * value lacks is unknown, as `null` is. `equals` and `not` then take a
	 * JSON value, `null` a JSON `null`; `lt` to `gte` a number or a string,
	 * matching a value of that JSON type; the `string` operators a string
	 * value, `mode` applying to them; the `array` ones an array.
	 */
	readonly path?: readonly string[]
	readonly stringContains?: string
	readonly stringStartsWith?: string
	readonly stringEndsWith?: string
	/** Each element is held, as PostgreSQL's `@>` holds it (D-149). */
	readonly arrayContains?: readonly unknown[]
	readonly arrayStartsWith?: unknown
	readonly arrayEndsWith?: unknown
}
