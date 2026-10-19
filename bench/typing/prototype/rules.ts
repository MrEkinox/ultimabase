// What every access rule receives, and the kernel's ready-made rules (D-10).

export type Operation = 'read' | 'create' | 'update' | 'delete'

/** Who sends an operation (D-19). */
export interface Caller {
	readonly kind: 'anonymous' | 'user' | 'master'
	readonly user?: { readonly id: string }
}

/** A rule that reads only the caller and the operation fits any access key. */
export type AnyRule = (facts: {
	readonly caller: Caller
	readonly operation: Operation
}) => boolean

export declare const allow: {
	readonly public: AnyRule
	readonly readOnly: AnyRule
	readonly private: AnyRule
}

/**
 * True when one of the rules is. The facts come from where the result is used,
 * never from the rules, so each rule is typed by its place.
 */
export declare function anyOf<Facts>(
	...rules: readonly NoInfer<(facts: Facts) => boolean>[]
): (facts: Facts) => boolean
