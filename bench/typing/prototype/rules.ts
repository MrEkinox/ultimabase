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
 * True when one of the rules is (D-10). The facts and the result come from
 * where it is used, never from the rules, so each rule is typed by its place.
 * In a read rule, the filters combine with `OR` (D-81): `true` from any rule
 * lets every row through, `false` adds nothing.
 */
export declare function anyOf<Facts, R = boolean>(
	...rules: readonly NoInfer<(facts: Facts) => R>[]
): (facts: Facts) => R

/**
 * True when every rule is (D-81), typed as `anyOf`. In a read rule, the
 * filters combine with `AND`: `false` from any rule hides every row, `true`
 * adds nothing.
 */
export declare function allOf<Facts, R = boolean>(
	...rules: readonly NoInfer<(facts: Facts) => R>[]
): (facts: Facts) => R
