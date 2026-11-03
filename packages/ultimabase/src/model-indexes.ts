// The indexes of `defineModel` and their checks against the model's fields
// (D-52, D-141, D-170, D-174, D-215).
import type { fieldType } from './symbols.ts'

/** An index of `defineModel`, over one or several fields (D-52). */
export type IndexShape = {
	readonly fields: readonly string[]
	readonly unique?: boolean
	/** A trigram index, for `contains` and `mode: 'insensitive'` (D-141). */
	readonly contains?: true
	/** A unique index whose string fields ignore case (D-170). */
	readonly mode?: 'insensitive'
	/** A unique index over the rows this filter selects only (D-215). */
	readonly where?: { readonly [field: string]: unknown }
}

/** The fields of each unique index; a partial one is no target (D-215). */
export type UniqueIndexFields<X> = X extends readonly (infer I)[]
	? I extends { readonly where: object }
		? never
		: I extends { readonly unique: true; readonly fields: infer K }
			? K
			: never
	: never

// An index covers scalar fields and `one` relations, the model's columns.
type IndexableKeys<F> = {
	[K in keyof F]: F[K] extends {
		readonly [fieldType]: { readonly kind: 'scalar' | 'one' }
	}
		? K
		: never
}[keyof F]
// A `contains` index covers one string field that is not a list (D-141).
type TextKeys<F> = {
	[K in keyof F]: F[K] extends {
		readonly [fieldType]: { readonly kind: 'scalar'; readonly value: infer V }
	}
		? [V] extends [string]
			? string extends V
				? K
				: never
			: never
		: never
}[keyof F]
type ContainsCheck<I, F> = I extends { readonly contains: true }
	? I extends {
			readonly fields: readonly [TextKeys<F>]
			readonly unique?: false | undefined
		}
		? unknown
		: {
				readonly contains: 'a contains index covers one string field that is not a list, and is not unique'
			}
	: unknown
type ModeError = {
	readonly mode: 'a case-insensitive index is unique, without contains, over a string field at least'
}
// A case-insensitive index is unique, over one string field at least (D-170).
type ModeCheck<I, F> = I extends { readonly mode: 'insensitive' }
	? I extends {
			readonly fields: readonly (infer K)[]
			readonly unique: true
			readonly contains?: undefined
		}
		? [Extract<K, TextKeys<F>>] extends [never]
			? ModeError
			: unknown
		: ModeError
	: unknown
// The kernel's fields, in a non-unique index only (D-22, D-174).
type Implicit = 'id' | 'createdAt' | 'updatedAt'
type NotIndexable<I, F> = I extends { readonly fields: readonly (infer K)[] }
	? Exclude<K, IndexableKeys<F> | Implicit>
	: never
type ImplicitCheck<I> = I extends {
	readonly fields: readonly (infer K)[]
	readonly unique: true
}
	? [Extract<K, Implicit>] extends [never]
		? unknown
		: {
				readonly fields: `'${Extract<K, Implicit>}' is set by the kernel: a unique index cannot name it`
			}
	: unknown

// A partial unique index filters on scalar fields that are no list, no json
// and no plugin's field type: each equals a value or `null`, or not (D-215).
type WhereFields<F> = {
	readonly [
		K in keyof F as F[K] extends {
			readonly [fieldType]: {
				readonly kind: 'scalar'
				readonly json: false
				readonly value: infer V
				readonly plugin?: infer P
			}
		}
			? [V] extends [readonly unknown[]]
				? never
				: [P & string] extends [never]
					? K
					: never
			: never
	]: F[K] extends {
		readonly [fieldType]: { readonly value: infer V }
	}
		? V | null | { readonly equals: V | null } | { readonly not: V | null }
		: never
}
type WhereShape<W, F> = {
	readonly [K in keyof W]: K extends keyof WhereFields<F>
		? WhereFields<F>[K]
		: `'${K & string}' is not a scalar field a where filters: a list, json, a relation and the kernel's fields are not`
}
type WhereCheck<I, F> = I extends { readonly where: infer W }
	? I extends { readonly unique: true; readonly contains?: undefined }
		? W extends WhereShape<W, F>
			? unknown
			: { readonly where: WhereShape<W, F> }
		: { readonly where: 'an index with a where is unique, without contains' }
	: unknown

/**
 * Each index names fields of the model. TypeScript first checks the call
 * before reading `fields`, while `F` is still any field name: the check
 * waits for the real fields.
 */
export type IndexCheck<X, F> = string extends keyof F
	? unknown
	: {
			readonly [I in keyof X]: ([NotIndexable<X[I], F>] extends [never]
				? unknown
				: {
						readonly fields: `'${NotIndexable<X[I], F> & string}' is not a scalar field or a one relation of the model`
					}) &
				ContainsCheck<X[I], F> &
				ModeCheck<X[I], F> &
				ImplicitCheck<X[I]> &
				WhereCheck<X[I], F>
		}
