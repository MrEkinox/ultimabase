// The names a relation's options give, checked once every model is typed.
import type { OneOfShape } from './one-of-types.ts'
import type { TargetFields } from './record.ts'
import type { fieldType, modelFields } from './symbols.ts'

// An `inverse` names a field of the target (D-37), and so does a `within`
// (D-220); a `size` faces a `one` (D-242), and a `many` facing a `oneOf`
// takes neither (D-247). They are checked here, where every
// model is typed, since reading the target while declaring is a cycle.
type WithinNames<W> = W extends string ? W : keyof W
type NameErrors<N extends string, F> = {
	[K in keyof F]: F[K] extends {
		readonly [fieldType]: {
			readonly target: infer T
			readonly options: infer O
		}
	}
		? | (O extends { readonly inverse: infer I extends string }
					? I extends keyof TargetFields<T>
						? never
						: `${N}.${K & string}: inverse '${I}' is not a field of the target`
					: never)
			| (O extends { readonly within: infer W }
					? Exclude<WithinNames<W>, keyof TargetFields<T>> extends infer U
						? U extends string
							? `${N}.${K & string}: within '${U}' is not a field of the target`
							: never
						: never
					: never)
			| (O extends {
					readonly size: object
					readonly inverse: infer I extends keyof TargetFields<T>
			  }
					? TargetFields<T>[I] extends {
							readonly [fieldType]: { readonly kind: 'many' }
						}
						? `${N}.${K & string}: size bounds a one-to-many relation only`
						: never
					: never)
			| (TargetFields<T> extends infer G
					? O extends { readonly inverse: infer I extends keyof G }
						? G[I] extends OneOfShape
							? O extends
									{ readonly within: unknown } | { readonly size: unknown }
								? `${N}.${K & string}: a many facing a oneOf takes no within or size`
								: never
							: never
						: never
					: never)
		: never
}[keyof F]

type AppNameErrors<M> = {
	[I in keyof M]: M[I] extends {
		readonly name: infer N extends string
		readonly [modelFields]: infer F
	}
		? NameErrors<N, F>
		: never
}[number & keyof M]

/** Checked on the whole options object, as `ModelCheck` is. */
export type RelationNameCheck<M> = [AppNameErrors<M>] extends [never]
	? unknown
	: { readonly relationError: AppNameErrors<M> }
