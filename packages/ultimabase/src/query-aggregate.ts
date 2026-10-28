// `aggregate`'s arguments and result (D-143): the result has the keys the
// arguments ask for, each field typed.
import type { SortedKeys, Where } from './query.ts'
import type { StoredValue, SystemFields } from './record.ts'

/** A model's scalars that an aggregate takes: no list, json or plugin field. */
type Aggregated<F> = SortedKeys<F> | keyof SystemFields
type ValueOf<F, K> = K extends keyof SystemFields
	? SystemFields[K]
	: K extends keyof F
		? NonNullable<StoredValue<F[K]>>
		: never
/** The fields whose values are `V`. */
type KeysWith<F, V> = {
	[K in Aggregated<F>]: ValueOf<F, K> extends V ? K : never
}[Aggregated<F>]
type Fields<K extends PropertyKey> = { readonly [P in K]?: true | undefined }

export type AggregateArgs<F> = {
	readonly where?: Where<F> | undefined
	readonly _count?:
		| true
		| ({ readonly _all?: true | undefined } & Fields<Aggregated<F>>)
		| undefined
	readonly _sum?: Fields<KeysWith<F, number>> | undefined
	readonly _avg?: Fields<KeysWith<F, number>> | undefined
	readonly _min?: Fields<KeysWith<F, number | string | Date>> | undefined
	readonly _max?: Fields<KeysWith<F, number | string | Date>> | undefined
}

type Asked<S> = {
	[K in keyof S]: S[K] extends true ? K : never
}[keyof S]
/** One value per field `S` names: `null` when no row has one. */
type Values<F, S, Number extends boolean> = {
	readonly [K in Asked<S>]:
		(Number extends true ? number : ValueOf<F, K>) | null
}

/** What `aggregate` returns for the arguments `A`. */
export type Aggregates<F, A> = (A extends { readonly _count: infer C }
	? C extends true
		? { readonly _count: number }
		: C extends object
			? { readonly _count: { readonly [K in Asked<C>]: number } }
			: unknown
	: unknown) &
	(A extends { readonly _sum: infer S extends object }
		? { readonly _sum: Values<F, S, true> }
		: unknown) &
	(A extends { readonly _avg: infer S extends object }
		? { readonly _avg: Values<F, S, true> }
		: unknown) &
	(A extends { readonly _min: infer S extends object }
		? { readonly _min: Values<F, S, false> }
		: unknown) &
	(A extends { readonly _max: infer S extends object }
		? { readonly _max: Values<F, S, false> }
		: unknown)
