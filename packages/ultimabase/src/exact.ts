// Query arguments are inferred (`const A`), so TypeScript skips the excess
// property check: a misspelled key next to a valid one would pass. `Exact`
// walks the written arguments against their schema and turns every unknown
// key into a message, reported on that key's line. It is `unknown` where the
// arguments fit, so a valid query costs one walk and no comparison.
type Leaf =
	string | number | boolean | bigint | symbol | Date | null | undefined
type Shapes<S> = Exclude<
	Extract<S, object>,
	Date | readonly unknown[] | ((...args: never[]) => unknown)
>
type Keys<S> = S extends unknown ? keyof S : never
type At<S, K> = S extends unknown ? (K extends keyof S ? S[K] : never) : never
type Items<S> = Extract<S, readonly unknown[]>[number]
// Identical, not only assignable both ways: an index signature is not.
type Same<A, S> =
	// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- `T` probes how each type relates, the usual identity test.
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends S ? 1 : 2
		? true
		: false
type Fine<O> = [keyof O] extends [never] ? unknown : O
// Only the misspelled keys, and the keys whose value holds one, are kept.
type Fields<A, S> = Fine<{
	readonly [
		K in keyof A as K extends Keys<S>
			? unknown extends Exact<A[K], At<S, K>>
				? never
				: K
			: K
	]: K extends Keys<S>
		? Exact<A[K], At<S, K>>
		: { readonly error: `'${K & string}' is not a key here` }
}>
// A written key is required; a type whose keys are all optional, such as a
// variable typed `Where<F>`, was checked where it was written. Walking it
// would recurse through every relation. So would arguments inferred as their
// own schema, as on a failed call.
export type Exact<A, S> = [A] extends [Leaf]
	? unknown
	: {} extends A
		? unknown
		: Same<A, S> extends true
			? unknown
			: A extends readonly unknown[]
				? Fits<A, { readonly [I in keyof A]: Exact<A[I], Items<S>> }>
				: Fields<A, Shapes<S>>
// A list whose every item fits is `unknown`, like an object: a list of rows
// to create sits inside another one (D-128).
type Fits<A, E> = { readonly [I in keyof A]: unknown } extends E ? unknown : E
