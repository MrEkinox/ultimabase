// Virtual fields (D-151): a field computed on read by the model's
// `.with({ virtuals })`, from the fields its `needs` lists, typed by its
// output and its input.
import type { SchemaTypes, StandardSchema } from './fields.ts'
import type { OutputValue } from './function.ts'
import type { Payload, Shaping } from './query.ts'
import type { RecordFor, RecordOf } from './record.ts'
import type { Caller } from './rules.ts'
import type { fieldType, modelFields, nullableOf } from './symbols.ts'

/** A virtual's arguments, the fields `run` reads and what it means. */
export type VirtualOptions = {
	/** A Standard Schema of an object: the field's arguments, flat. */
	readonly input?: StandardSchema
	/** The scalar fields `run` reads, which the kernel always reads. */
	readonly needs?: readonly string[]
	readonly description?: string
}

/** The options of a virtual given none. */
export type NoOptions = {
	readonly input?: never
	readonly needs?: never
}

type ReadRule = (facts: {
	readonly caller: Caller
	readonly operation: 'read'
	readonly record: RecordFor<never>
}) => boolean

/** A virtual's `.with`: a read rule, which hides it further (D-44). */
export type VirtualWith = {
	readonly access?: ReadRule | { readonly read?: ReadRule }
}

// `O` is a Standard Schema or a thunk, constrained to `object` only: a
// thunk's return type is read lazily, as a relation's target is.
export interface Virtual<O, X> {
	readonly [fieldType]: {
		readonly kind: 'virtual'
		readonly output: O
		readonly options: X
	}
	with(rules: VirtualWith): Virtual<O, X>
}

/** The output a virtual's thunk returns, `[X]` for a list, or its schema. */
type OutputOf<O> = O extends StandardSchema
	? O
	: O extends () => infer R
		? R extends readonly [unknown]
			? R
			: R extends readonly (infer X)[]
				? readonly [X]
				: R
		: never

/** What `run` returns for one row: a model's scalars, a type, a value. */
export type VirtualValue<O> = OutputValue<OutputOf<O>>

type Facts<X> = X extends {
	readonly [fieldType]: { readonly output: infer O; readonly options: infer P }
}
	? { readonly output: O; readonly options: P }
	: never
type In<P> = P extends { readonly input: infer S }
	? SchemaTypes<S> extends { readonly output: infer O }
		? O
		: never
	: undefined
type NeedsOf<P> = P extends { readonly needs: readonly (infer K)[] } ? K : never
type Row<F, P> = Pick<RecordOf<F>, (NeedsOf<P> & keyof RecordOf<F>) | 'id'>

export type VirtualKeys<F> = {
	[K in keyof F]: F[K] extends {
		readonly [fieldType]: { readonly kind: 'virtual' }
	}
		? K
		: never
}[keyof F]

type Rule<F, O, P> =
	| {
			readonly run: (facts: {
				readonly caller: Caller
				readonly input: In<P>
				readonly record: Row<F, P>
			}) => VirtualValue<O> | Promise<VirtualValue<O>>
			readonly runMany?: never
	  }
	| {
			/** One value per record, in their order. */
			readonly runMany: (facts: {
				readonly caller: Caller
				readonly input: In<P>
				readonly records: readonly Row<F, P>[]
			}) => readonly VirtualValue<O>[] | Promise<readonly VirtualValue<O>[]>
			readonly run?: never
	  }

/** A `needs` that names no field of the model fails to compile. */
type Checked<F, X> =
	Facts<X> extends { readonly output: infer O; readonly options: infer P }
		? [Exclude<NeedsOf<P>, keyof RecordOf<F>>] extends [never]
			? Rule<F, O, P>
			: { readonly unknownNeeds: Exclude<NeedsOf<P>, keyof RecordOf<F>> }
		: never

/** `run` or `runMany` for each virtual of the model. */
export type VirtualRules<F> = {
	readonly [K in VirtualKeys<F>]: Checked<F, F[K]>
}

/** The model a virtual returns rows of, `never` for another output. */
type ModelOf<R> = R extends { readonly [modelFields]: infer F }
	? F
	: R extends { readonly [nullableOf]: infer X }
		? ModelOf<X>
		: R extends readonly [infer X]
			? ModelOf<X>
			: never
type InputOf<P> = P extends { readonly input: infer S }
	? SchemaTypes<S> extends { readonly input: infer I }
		? I
		: never
	: never

/** Whether a virtual is in the default row: a value without input. */
type IsDefault<X> =
	Facts<X> extends { readonly output: infer O; readonly options: infer P }
		? O extends StandardSchema
			? [InputOf<P>] extends [never]
				? true
				: false
			: false
		: false

export type DefaultVirtualKeys<F> = {
	[K in VirtualKeys<F>]: IsDefault<F[K]> extends true ? K : never
}[VirtualKeys<F>]

/**
 * A virtual's `select` or `include`: `true` when its input properties are
 * all optional, else its input, and a model's `select`, `include` and `omit`.
 */
export type VirtualArgs<X> =
	Facts<X> extends { readonly output: infer O; readonly options: infer P }
		? | ([InputOf<P>] extends [never]
					? boolean
					: Partial<InputOf<P>> extends InputOf<P>
						? boolean
						: never)
			| ([InputOf<P> | ModelOf<OutputOf<O>>] extends [never]
					? never
					: ([InputOf<P>] extends [never] ? unknown : InputOf<P>) &
							([ModelOf<OutputOf<O>>] extends [never]
								? unknown
								: Shaping<ModelOf<OutputOf<O>>>))
		: never

type Shaped<R, A> = R extends { readonly [modelFields]: infer F }
	? Payload<F, A>
	: R extends { readonly [nullableOf]: infer X }
		? Shaped<X, A> | null
		: R extends readonly [infer X]
			? Shaped<X, A>[]
			: OutputValue<R>

/** A selected virtual's value, its rows shaped by `A`. */
export type VirtualOutput<X, A> =
	Facts<X> extends { readonly output: infer O } ? Shaped<OutputOf<O>, A> : never

/** The virtuals of the default row. */
export type DefaultVirtuals<F> = {
	readonly [K in DefaultVirtualKeys<F>]: VirtualOutput<F[K], true>
}

/** A row without `select`: its scalars, and its default virtuals. */
export type DefaultRow<F> = [DefaultVirtualKeys<F>] extends [never]
	? RecordOf<F>
	: RecordOf<F> & DefaultVirtuals<F>

/** The virtuals an `include` takes, none for a model without. */
export type VirtualIncludes<F> = [VirtualKeys<F>] extends [never]
	? unknown
	: { readonly [K in VirtualKeys<F>]?: VirtualArgs<F[K]> }
