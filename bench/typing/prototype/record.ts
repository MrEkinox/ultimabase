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

type Connect = { readonly connect: { readonly id: string } }
type InputOf<X> = X extends Scalar
	? WrittenValue<X>
	: X extends Relation<'one', unknown, infer O>
		? IsOptional<O> extends true
			? Connect | null
			: Connect
		: { readonly connect?: readonly { readonly id: string }[] }
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
				: true
			: false

export type CreateData<F> = {
	readonly [K in keyof F as Needed<F[K]> extends true ? K : never]: InputOf<
		F[K]
	>
} & {
	readonly [K in keyof F as Needed<F[K]> extends true ? never : K]?: InputOf<
		F[K]
	>
}

export type UpdateData<F> = { readonly [K in keyof F]?: InputOf<F[K]> }

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
