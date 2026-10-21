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

/**
 * The stored row access rules and hooks receive (D-77): the record plus each
 * `one` relation's key, which the row already holds.
 */
export type StoredRecord<F> = RecordOf<F> & {
	readonly [
		K in keyof F as F[K] extends Relation<'one'> ? K : never
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
type Connect = { readonly connect: Ref }
/** A created relation is connected; nested creation comes later (D-20). */
type CreateInput<X> = X extends Scalar
	? WrittenValue<X>
	: X extends Relation<'one'>
		? Connect
		: { readonly connect?: readonly Ref[] }
/** An optional `one` relation is unset with `disconnect: true` (D-20). */
type UpdateInput<X> = X extends Scalar
	? WrittenValue<X>
	: X extends Relation<'one', unknown, infer O>
		? IsOptional<O> extends true
			? Connect | { readonly disconnect: true }
			: Connect
		: {
				readonly connect?: readonly Ref[]
				readonly disconnect?: readonly Ref[]
			}
type Needed<X> =
	X extends Scalar<unknown, infer O>
		? IsOptional<O> extends true
			? false
			: O extends { readonly default: unknown }
				? false
				: true
		: X extends Relation<'one', unknown, infer O>
			? IsOptional<O> extends true
				? false
				: O extends { readonly default: unknown }
					? false
					: true
			: false

export type CreateData<F> = {
	readonly [K in keyof F as Needed<F[K]> extends true ? K : never]: CreateInput<
		F[K]
	>
} & {
	readonly [
		K in keyof F as Needed<F[K]> extends true ? never : K
	]?: CreateInput<F[K]>
}

export type UpdateData<F> = { readonly [K in keyof F]?: UpdateInput<F[K]> }

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
