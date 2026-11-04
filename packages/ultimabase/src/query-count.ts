// The reads that answer how many rows the caller reads, or whether one:
// `count`, and `exists` for server code only (D-244); and a read's `_count`.
import type { KeysOf, QueryOptions, TargetOf, Where } from './query.ts'
import type { TargetFields } from './record.ts'

export interface CountQueries<F> {
	count(
		this: void,
		args?: { readonly where?: Where<F> },
		options?: QueryOptions,
	): Promise<number>
	/** Whether `count` would find a row; server code only (D-244). */
	exists(
		this: void,
		args?: { readonly where?: Where<F> },
		options?: QueryOptions,
	): Promise<boolean>
}

/** `_count`: every `many` relation, or the ones `select` names (D-134). */
type Count<F> =
	| true
	| {
			readonly select: {
				readonly [K in KeysOf<F, 'many'>]?:
					| boolean
					| { readonly where?: Where<TargetFields<TargetOf<F[K]>>> | undefined }
			}
	  }

/** A model with a `many` relation takes `_count`. */
export type Counts<F> = [KeysOf<F, 'many'>] extends [never]
	? unknown
	: { readonly _count?: Count<F> | false }

type Counted<F, C> = C extends { readonly select: infer S }
	? {
			readonly [
				K in keyof S as S[K] extends false | undefined ? never : K
			]: number
		}
	: C extends true
		? { readonly [K in KeysOf<F, 'many'>]: number }
		: unknown

/** The `_count` of a `select` or an `include` `A`. */
export type CountOf<F, A> = A extends { readonly _count: infer C }
	? C extends false | undefined
		? unknown
		: { readonly _count: Counted<F, C> }
	: unknown
