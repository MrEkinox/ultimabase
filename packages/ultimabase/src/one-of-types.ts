// The types of `f.oneOf` (D-247): a `one` to a row of one of its kinds'
// models, read `{ kind, [kind]: row }`, each kind filtered, shaped and
// written as a `one`.
import type { Described } from './described.ts'
import type {
	Declared,
	FieldWith,
	Hidden,
	OpenWith,
	RelationValue,
} from './field-rules.ts'
import type { FilterOf, Payload, RelationArgs, Where } from './query.ts'
import type { TargetFields } from './record.ts'
import type { fieldType } from './symbols.ts'

/** What shapes a `oneOf`: what a stored `one` takes but its key's (D-247). */
export type OneOfOptions = Described & {
	readonly optional?: boolean
	readonly onDelete?: 'cascade' | 'restrict' | 'setNull'
	readonly default?: undefined
	readonly inverse?: undefined
	readonly dbName?: undefined
	readonly within?: undefined
	readonly unique?: undefined
	readonly from?: undefined
}

/** The kinds `f.oneOf` takes: each a thunk of its model, none a filter key. */
export type OneOfKinds = {
	readonly [kind: string]: object
	readonly kind?: never
	readonly is?: never
	readonly isNot?: never
}

/** `{ kind: K, [K]: V }`, one object TypeScript narrows on `kind`. */
type Tagged<K, V> = {
	readonly [P in 'kind' | (K & string)]: P extends 'kind' ? K : V
}

/** A `oneOf` as a rule and a hook see it: its kind and the row's id. */
export type OneOfValue<T> = {
	[K in keyof T]: Tagged<K, RelationValue>
}[keyof T]

export interface OneOf<T, O, U = never> {
	readonly [fieldType]: {
		readonly kind: 'oneOf'
		readonly targets: T
		readonly options: O
	}
	with<R extends object = never>(
		rules: FieldWith<NoInfer<R>, OneOfValue<T> | null, U> & OpenWith,
	): OneOf<T, O> & Declared<R>
	with<R extends object = never>(
		rules: FieldWith<NoInfer<R>, OneOfValue<T> | null, U>,
	): OneOf<T, O> & Declared<R> & Hidden
}

export type OneOfShape<T = unknown, O = unknown> = {
	readonly [fieldType]: {
		readonly kind: 'oneOf'
		readonly targets: T
		readonly options: O
	}
}

/** Kind `K` of a `oneOf` as the `one` it reads, filters and writes as. */
export type KindOne<T, K extends keyof T> = {
	readonly [fieldType]: {
		readonly kind: 'one'
		readonly target: T[K]
		readonly options: object
	}
}

/** The record's `oneOf`, `null` when optional and unset (D-77). */
export type OneOfStored<X> =
	X extends OneOfShape<infer T, infer O>
		? O extends { readonly optional: true }
			? OneOfValue<T> | null
			: OneOfValue<T>
		: never

/** `true` shapes every kind, an object of kinds each as a `one`. */
export type OneOfArgs<X> =
	X extends OneOfShape<infer T>
		? {
				readonly [K in keyof T]?: boolean | RelationArgs<KindOne<T, K>>
			}
		: never

type Shown<T, K extends keyof T, A> = A extends true
	? Tagged<K, Payload<TargetFields<T[K]>, true>>
	: A extends { readonly [P in K]: infer S }
		? S extends false | undefined
			? { readonly kind: K }
			: Tagged<K, Payload<TargetFields<T[K]>, S>>
		: { readonly kind: K }

/**
 * A row's `oneOf`: a kind it leaves out reads `{ kind }` alone; `null` when
 * unset, or when the target is a row the caller cannot read (D-86).
 */
export type OneOfOutput<X, A> =
	X extends OneOfShape<infer T>
		? { [K in keyof T]: Shown<T, K, A> }[keyof T] | null
		: never

/** The intersection of a union's members, read through a parameter. */
type Every<U> = (U extends unknown ? (value: U) => void : never) extends (
	value: infer I,
) => void
	? I
	: never

type KindWhere<T> = { [K in keyof T]: Where<TargetFields<T[K]>> }[keyof T]
type Box<V> = { readonly value: V }
type Kinds<T, P> = {
	[K in keyof T]: Where<TargetFields<T[K]>> extends infer W
		? Box<P extends keyof W ? W[P] : never>
		: never
}[keyof T]

/**
 * The `where` of the fields every kind has, each filter fitting every
 * kind's: a field of another type on one kind filters nothing.
 */
type SharedWhere<T> = {
	readonly [P in keyof KindWhere<T>]?: Every<Kinds<T, P>> extends Box<infer V>
		? V
		: never
}

type Empty<O> = O extends { readonly optional: true } ? null : never

/** A `oneOf`'s filter: on the fields its kinds share, a kind, or `kind`. */
export type OneOfFilter<X> =
	X extends OneOfShape<infer T, infer O>
		? {
				readonly is?: SharedWhere<T> | Empty<O> | undefined
				readonly isNot?: SharedWhere<T> | Empty<O> | undefined
				readonly kind?: keyof T | undefined
			} & {
				readonly [K in keyof T]?: FilterOf<KindOne<T, K>> | undefined
			}
		: never

/** The `oneOf` fields of `F`. */
export type OneOfKeys<F> = {
	[K in keyof F]: F[K] extends OneOfShape ? K : never
}[keyof F]
