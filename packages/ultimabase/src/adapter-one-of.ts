// A `oneOf` kind's stored key, as the adapter sees it (D-247).

/** The `oneOf` field a key is a kind of. */
export type OneOfKey = {
	readonly field: string
	readonly kind: string
	/** Without it, exactly one key of the field is set; with it, at most one. */
	readonly optional: boolean
}
