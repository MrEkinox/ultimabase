// `aggregate`'s arguments and result (D-143): the result has the keys the
// arguments ask for, each field typed.
import type { SortedKeys, Where } from './query.ts'
import type { StoredValue, SystemFields } from './record.ts'
import type { calendarDay, fieldType } from './symbols.ts'

/** A model's scalars that an aggregate takes: no list, json or plugin field. */
export type Aggregated<F> = SortedKeys<F> | keyof SystemFields
export type ValueOf<F, K> = K extends keyof SystemFields
	? SystemFields[K]
	: K extends keyof F
		? NonNullable<StoredValue<F[K]>>
		: never
/** The fields whose values are `V`. */
export type KeysWith<F, V> = {
	[K in Aggregated<F>]: ValueOf<F, K> extends V ? K : never
}[Aggregated<F>]
/** Whether `X` is a decimal field (D-145), filtered and summed as a string. */
export type IsDecimal<X> = X extends {
	readonly [fieldType]: { readonly options: { readonly precision: number } }
}
	? true
	: false
/** Whether `X` is a string compared in order: a decimal or a day (D-150). */
export type IsOrdered<X> =
	IsDecimal<X> extends true
		? true
		: X extends {
					readonly [fieldType]: {
						readonly options: { readonly [calendarDay]: true }
					}
			  }
			? true
			: false
export type DecimalKeys<F> = {
	[K in Aggregated<F>]: K extends keyof F
		? IsDecimal<F[K]> extends true
			? K
			: never
		: never
}[Aggregated<F>]
export type Summed<F> = KeysWith<F, number> | DecimalKeys<F>
type Fields<K extends PropertyKey> = { readonly [P in K]?: true | undefined }

export type AggregateArgs<F> = {
	readonly where?: Where<F> | undefined
	readonly _count?:
		| true
		| ({ readonly _all?: true | undefined } & Fields<Aggregated<F>>)
		| undefined
	readonly _sum?: Fields<Summed<F>> | undefined
	readonly _avg?: Fields<Summed<F>> | undefined
	readonly _min?: Fields<KeysWith<F, number | string | Date>> | undefined
	readonly _max?: Fields<KeysWith<F, number | string | Date>> | undefined
}

type Asked<S> = {
	[K in keyof S]: S[K] extends true ? K : never
}[keyof S]
/**
 * One value per field `S` names: `null` when no row has one. An average is
 * a number, a sum a number or a decimal's string, a minimum or a maximum
 * the field's value.
 */
type Values<F, S, As extends 'sum' | 'avg' | 'value'> = {
	readonly [K in Asked<S>]:
		| (As extends 'avg'
				? number
				: As extends 'sum'
					? K extends DecimalKeys<F>
						? string
						: number
					: ValueOf<F, K>)
		| null
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
		? { readonly _sum: Values<F, S, 'sum'> }
		: unknown) &
	(A extends { readonly _avg: infer S extends object }
		? { readonly _avg: Values<F, S, 'avg'> }
		: unknown) &
	(A extends { readonly _min: infer S extends object }
		? { readonly _min: Values<F, S, 'value'> }
		: unknown) &
	(A extends { readonly _max: infer S extends object }
		? { readonly _max: Values<F, S, 'value'> }
		: unknown)
