// The record a model stores, and the data written to it.
import type { UniqueWhere } from './query.ts'
import type { fieldType, modelFields } from './symbols.ts'
import type { VirtualKeys } from './virtual.ts'

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
/** A unique target of the relation's model, as stored (D-52, D-138). */
type Target<X> =
	X extends Relation<'one' | 'many', infer T>
		? UniqueWhere<TargetFields<T>>
		: never
type OrCreate<N, K, X> = {
	readonly where: Target<X>
	readonly create: Created<N, K, X>
}
/**
 * The data of a linked row relation `K` of model `N` updates, without the
 * relation back to the row (D-138).
 */
type Updated<N, K, X> =
	X extends Relation<'one' | 'many', infer T>
		? Omit<UpdateData<TargetFields<T>, TargetName<T>>, InverseOf<N, K, X>>
		: never
/**
 * A `one` is connected or created; `connectOrCreate` only where the caller
 * writes it, as rules and hooks see it resolved (D-138).
 */
type Connect<N, K, X, Resolved extends boolean = false> =
	| { readonly connect: Ref }
	| { readonly create: Created<N, K, X> }
	| (Resolved extends true
			? never
			: { readonly connectOrCreate: OrCreate<N, K, X> })
/** A relation is connected or created (D-20, D-128, D-138). */
type CreateInput<X, N, K> = X extends Scalar
	? WrittenValue<X>
	: X extends Relation<'one'>
		? Connect<N, K, X>
		: {
				readonly connect?: readonly Ref[]
				readonly create?: readonly Created<N, K, X>[]
				readonly connectOrCreate?: readonly OrCreate<N, K, X>[]
			}
/** A plain number field: no list, no JSON, no plugin field type. */
type IsNumber<X> = X extends {
	readonly [fieldType]: {
		readonly value: infer V
		readonly input: infer I
		readonly json: false
		readonly stored: infer S
	}
}
	? [V, I, S] extends [number, number, never]
		? [number] extends [V]
			? true
			: false
		: false
	: false

/** Exactly one of `T`'s keys; `undefined` leaves the field as it is. */
type OneOf<T> = {
	[K in keyof T]: { readonly [P in K]: T[K] | undefined } & {
		readonly [P in Exclude<keyof T, K>]?: never
	}
}[keyof T]

/** One operation on a number, computed on the row (D-132). */
type NumberUpdate<V> = OneOf<{
	readonly set: V
	readonly increment: number
	readonly decrement: number
	readonly multiply: number
	readonly divide: number
}>

/** One operation on a list, with an element or a list of them (D-149). */
type ListUpdate<E> = OneOf<{
	readonly set: E | readonly E[]
	readonly push: E | readonly E[]
	readonly pushUnique: E | readonly E[]
	readonly remove: E | readonly E[]
}>

/** A list's element type, `never` for any other field. */
type ElementOf<X> =
	X extends Scalar<unknown, { readonly list: true }>
		? WrittenValue<X> extends readonly (infer E)[]
			? E
			: never
		: never

/** A `one` the caller writes; rules and hooks see it resolved (D-138). */
type OneUpdate<N, K, X, O, Operations extends boolean> =
	| Connect<N, K, X, Not<Operations>>
	| { readonly update: Updated<N, K, X> }
	| (IsOptional<O> extends true
			? { readonly disconnect: true } | { readonly delete: true }
			: never)
/** A `many` the caller writes; `set` reaches rules and hooks resolved. */
type ManyUpdate<N, K, X, Operations extends boolean> = {
	readonly connect?: readonly Ref[]
	readonly disconnect?: readonly Ref[]
	readonly create?: readonly Created<N, K, X>[]
	readonly update?: readonly {
		readonly where: Target<X>
		readonly data: Updated<N, K, X>
	}[]
	readonly delete?: readonly Target<X>[]
} & (Operations extends true
	? {
			readonly set?: readonly Ref[]
			readonly connectOrCreate?: readonly OrCreate<N, K, X>[]
		}
	: unknown)
type Not<B extends boolean> = B extends true ? false : true

/**
 * An optional `one` relation is unset with `disconnect: true` (D-20); with
 * `Operations`, a number field also takes an operation (D-132), a list one
 * (D-149), and a relation `set` and `connectOrCreate` (D-138).
 */
type UpdateInput<X, N, K, Operations extends boolean> = X extends Scalar
	? Operations extends true
		? IsNumber<X> extends true
			? WrittenValue<X> | NumberUpdate<WrittenValue<X>>
			: [ElementOf<X>] extends [never]
				? WrittenValue<X>
				: WrittenValue<X> | ListUpdate<ElementOf<X>>
		: WrittenValue<X>
	: X extends Relation<'one', unknown, infer O>
		? OneUpdate<N, K, X, O, Operations>
		: ManyUpdate<N, K, X, Operations>
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

/** `V`'s fields but `E`, each required when `F` needs it to create a row. */
type Creating<F, E, V extends { readonly [K in keyof F]: unknown }> = {
	readonly [
		K in keyof F as K extends E ? never : Needed<F[K]> extends true ? K : never
	]: V[K]
} & {
	readonly [
		K in keyof F as K extends E ? never : Needed<F[K]> extends true ? never : K
	]?: V[K] | undefined
}

/**
 * The data that creates a row of model `N`, without its views (D-151) nor
 * field `E`: the relation back to the row that creates it (D-128). Code that does not know `N`
 * leaves that relation to the kernel.
 */
export type CreateData<F, N = never, E = never> = Creating<
	F,
	E | Unwritten<F>,
	{ readonly [K in keyof F]: CreateInput<F[K], N, K> }
>

/** A row `createMany` creates: a `one` is connected, a `many` not written (D-135). */
export type CreateManyData<F> = Creating<
	F,
	| { [K in keyof F]: F[K] extends Relation<'many'> ? K : never }[keyof F]
	| VirtualKeys<F>,
	{
		readonly [K in keyof F]: F[K] extends Scalar
			? WrittenValue<F[K]>
			: { readonly connect: Ref }
	}
>

/**
 * `undefined` leaves a field unchanged, as in Prisma (D-84). Rules and hooks
 * see the data without `Operations`: each number and list as computed
 * (D-132, D-149), each relation resolved (D-138).
 */
export type UpdateData<F, N = never, Operations extends boolean = true> = {
	readonly [K in keyof F as K extends Unwritten<F> ? never : K]?:
		UpdateInput<F[K], N, K, Operations> | undefined
}

/** The views and virtuals of `F`, which no data writes (D-151). */
type Unwritten<F> = Views<F> | VirtualKeys<F>
type Views<F> = {
	[K in keyof F]: F[K] extends Relation<
		'many',
		unknown,
		{ readonly from: string }
	>
		? K
		: never
}[keyof F]

/** The data `updateMany` writes on each row: scalars only (D-133). */
export type UpdateManyData<F> = Pick<
	UpdateData<F>,
	ScalarKeys<F> & keyof UpdateData<F>
>

export type ScalarKeys<F> = {
	[K in keyof F]: F[K] extends Scalar ? K : never
}[keyof F]

export type UniqueKeys<F> = {
	[K in keyof F]: F[K] extends Scalar<
		unknown,
		{ readonly unique: true | 'insensitive' }
	>
		? K
		: never
}[keyof F]

export type RelationKeys<F> = {
	[K in keyof F]: F[K] extends Relation<'one' | 'many'> ? K : never
}[keyof F]
