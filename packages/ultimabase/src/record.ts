// The record a model stores, and the data written to it.
import type { fieldType, modelFields } from './symbols.ts'

type Scalar<V = unknown, O = unknown> = {
	readonly [fieldType]: {
		readonly kind: 'scalar'
		readonly value: V
		readonly options: O
	}
}
type Relation<K extends 'one' | 'many', T = unknown, O = unknown> = {
	readonly [fieldType]: {
		readonly kind: K
		readonly target: T
		readonly options: O
	}
}
type IsOptional<O> = O extends { readonly optional: true } ? true : false

/** The fields of the model a relation's thunk returns. */
export type TargetFields<T> = T extends () => infer M
	? M extends { readonly [modelFields]: infer F }
		? F
		: never
	: never

/** What the kernel adds to every record (D-22). */
export type SystemFields = {
	readonly id: string
	readonly createdAt: Date
	readonly updatedAt: Date
}

/** A stored scalar value: an optional field may be `null`. */
export type StoredValue<X> =
	X extends Scalar<infer V, infer O>
		? IsOptional<O> extends true
			? V | null
			: V
		: never

/** A record without its relations, as a query returns it without `select`. */
export type RecordOf<F> = SystemFields & {
	readonly [K in keyof F as F[K] extends Scalar ? K : never]: StoredValue<F[K]>
}

/** A stored `one` relation: its key, `null` when optional and unset. */
type StoredRef<X> =
	X extends Relation<'one', unknown, infer O>
		? IsOptional<O> extends true
			? { readonly id: string } | null
			: { readonly id: string }
		: never

/** The name of the model a relation's thunk returns. */
type TargetName<T> = T extends () => infer M
	? M extends { readonly name: infer N extends string }
		? N
		: never
	: never

/**
 * Whether field `J` of target `T` may face field `K` of model `N`, as startup
 * resolves it (D-37).
 */
type Facing<N, K, T, J> =
	TargetFields<T>[J & keyof TargetFields<T>] extends Relation<
		'one' | 'many',
		infer B,
		infer O
	>
		? O extends { readonly inverse: infer I extends string }
			? [I] extends [K]
				? true
				: false
			: [J, TargetName<T>] extends [K, N]
				? false
				: [TargetName<B>] extends [N]
					? true
					: false
		: false

/**
 * The field of relation `X`'s target that faces it, named `K` on model `N`:
 * the rows it creates leave it out (D-128).
 */
type InverseOf<N, K, X> =
	X extends Relation<'one' | 'many', infer T, infer O>
		? O extends { readonly inverse: infer I extends string }
			? I
			: {
					[J in keyof TargetFields<T>]: Facing<N, K, T, J> extends true
						? J
						: never
				}[keyof TargetFields<T>]
		: never

/**
 * Whether relation `X`, named `K` on model `N`, faces a `one`: the two
 * sides of a one-to-one, of which the required one stores the key (D-37).
 */
type FacesOne<N, K, X> =
	X extends Relation<'one', infer T>
		? [InverseOf<N, K, X>] extends [never]
			? false
			: TargetFields<T>[InverseOf<N, K, X> &
						keyof TargetFields<T>] extends Relation<'one'>
				? true
				: false
		: false

/**
 * A `one` relation the row stores: a required one, or an optional one facing
 * a `many`. The optional side of a one-to-one has no column (D-37).
 */
type Stored<N, K, X> =
	X extends Relation<'one', unknown, infer O>
		? IsOptional<O> extends true
			? FacesOne<N, K, X> extends true
				? false
				: true
			: true
		: false

/**
 * The stored row of model `N` that access rules and hooks receive (D-77):
 * the record plus the key of each `one` relation the row stores, with no
 * query.
 */
export type StoredRecord<F, N extends string> = RecordOf<F> & {
	readonly [
		K in keyof F as Stored<N, K, F[K]> extends true ? K : never
	]: StoredRef<F[K]>
}

type Loose = { readonly id: string; readonly [field: string]: unknown }

/**
 * The record a field rule receives (D-44): loose, or with the fields the
 * developer declared.
 */
export type RecordFor<R extends object> = [R] extends [never]
	? Loose
	: { readonly id: string } & Readonly<R>

/** A written scalar value: the schema's input when one transforms (D-23). */
type WrittenValue<X> = X extends {
	readonly [fieldType]: { readonly input: infer I; readonly options: infer O }
}
	? IsOptional<O> extends true
		? I | null
		: I
	: StoredValue<X>

type Ref = { readonly id: string }
/** The data of a row relation `K` of model `N` creates (D-128). */
type Created<N, K, X> =
	X extends Relation<'one' | 'many', infer T>
		? CreateData<TargetFields<T>, TargetName<T>, InverseOf<N, K, X>>
		: never
type Connect<N, K, X> =
	{ readonly connect: Ref } | { readonly create: Created<N, K, X> }
/** A relation is connected or created (D-20, D-128). */
type CreateInput<X, N, K> = X extends Scalar
	? WrittenValue<X>
	: X extends Relation<'one'>
		? Connect<N, K, X>
		: {
				readonly connect?: readonly Ref[]
				readonly create?: readonly Created<N, K, X>[]
			}
/** An optional `one` relation is unset with `disconnect: true` (D-20). */
type UpdateInput<X, N, K> = X extends Scalar
	? WrittenValue<X>
	: X extends Relation<'one', unknown, infer O>
		? IsOptional<O> extends true
			? Connect<N, K, X> | { readonly disconnect: true }
			: Connect<N, K, X>
		: {
				readonly connect?: readonly Ref[]
				readonly disconnect?: readonly Ref[]
				readonly create?: readonly Created<N, K, X>[]
			}
// A list left unwritten is empty (D-120).
type Needed<X> =
	X extends Scalar<unknown, infer O>
		? IsOptional<O> extends true
			? false
			: O extends { readonly default: unknown } | { readonly list: true }
				? false
				: true
		: X extends Relation<'one', unknown, infer O>
			? IsOptional<O> extends true
				? false
				: O extends { readonly default: unknown }
					? false
					: true
			: false

/**
 * The data that creates a row of model `N`, without field `E`: the relation
 * back to the row that creates it (D-128). Code that does not know `N`
 * leaves that relation to the kernel.
 */
export type CreateData<F, N = never, E = never> = {
	readonly [
		K in keyof F as K extends E ? never : Needed<F[K]> extends true ? K : never
	]: CreateInput<F[K], N, K>
} & {
	readonly [
		K in keyof F as K extends E ? never : Needed<F[K]> extends true ? never : K
	]?: CreateInput<F[K], N, K> | undefined
}

/** `undefined` leaves a field unchanged, as in Prisma (D-84). */
export type UpdateData<F, N = never> = {
	readonly [K in keyof F]?: UpdateInput<F[K], N, K> | undefined
}

export type ScalarKeys<F> = {
	[K in keyof F]: F[K] extends Scalar ? K : never
}[keyof F]

export type UniqueKeys<F> = {
	[K in keyof F]: F[K] extends Scalar<unknown, { readonly unique: true }>
		? K
		: never
}[keyof F]

export type RelationKeys<F> = {
	[K in keyof F]: F[K] extends Relation<'one' | 'many'> ? K : never
}[keyof F]
