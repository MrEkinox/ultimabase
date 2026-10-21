// What every access rule receives, and the kernel's ready-made rules (D-10).
import type { RecordOf } from './record.ts'
import type { modelFields } from './symbols.ts'

export type Operation = 'read' | 'create' | 'update' | 'delete'

/**
 * The application declares its user model here, once; without it,
 * `caller.user` is `{ id }` (D-24, D-62).
 */
export interface Register {}

/** The user record a registry gives `caller.user`. */
export type UserOf<R> = R extends {
	readonly user: { readonly [modelFields]: infer F }
}
	? RecordOf<F>
	: { readonly id: string }

/** Who sends an operation (D-19). */
export type Caller =
	| { readonly kind: 'anonymous' }
	| { readonly kind: 'user'; readonly user: UserOf<Register> }
	| {
			readonly kind: 'master'
			readonly master: { readonly source: 'code' | 'key' }
	  }

/** Server code acting with every right; only the kernel creates it. */
export declare const master: Extract<Caller, { readonly kind: 'master' }>

/** A rule that reads only the caller and the operation fits any access key. */
export type AnyRule = (facts: {
	readonly caller: Caller
	readonly operation: Operation
}) => boolean

/** A rule that reads only the caller also fits a function's access (D-27). */
export type CallerRule = (facts: { readonly caller: Caller }) => boolean

export declare const allow: {
	readonly public: CallerRule
	readonly readOnly: AnyRule
	readonly private: CallerRule
}

/**
 * True when one of the rules is. The facts come from where the result is used,
 * never from the rules, so each rule is typed by its place.
 */
export declare function anyOf<Facts>(
	...rules: readonly NoInfer<(facts: Facts) => boolean>[]
): (facts: Facts) => boolean
