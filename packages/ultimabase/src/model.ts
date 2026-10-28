// The model `defineModel(...).with(...)` returns (D-07, D-24) and the
// application `defineApp` assembles.
import type { Nullable } from './function.ts'
import type { FindWhere, Queries, Where } from './query.ts'
import type {
	CreateData,
	RecordOf,
	StoredRecord,
	TargetFields,
	UpdateData,
} from './record.ts'
import type { Caller } from './rules.ts'
import type { VirtualRules } from './virtual.ts'
import type {
	declaredRecord,
	fieldType,
	modelFields,
	readFilter,
} from './symbols.ts'

type ReadFacts = { readonly caller: Caller; readonly operation: 'read' }
type CreateFacts<F, N extends string> = {
	readonly caller: Caller
	readonly operation: 'create'
	readonly value: CreateData<F, N>
}
type UpdateFacts<F, N extends string> = {
	readonly caller: Caller
	readonly operation: 'update'
	readonly record: StoredRecord<F, N>
	readonly value: UpdateData<F, N, false>
}
type DeleteFacts<F, N extends string> = {
	readonly caller: Caller
	readonly operation: 'delete'
	readonly record: StoredRecord<F, N>
}

/** A read filter; only the `where` a read rule receives builds one (D-10). */
type ReadFilter = { readonly [readFilter]: true }
/**
 * A model read rule cannot see the record: it may return a filter (D-10).
 * TypeScript never checks a returned object for unknown keys, but it checks
 * an argument: `where({ ... })` refuses a misspelled key on its line.
 */
type ReadRule<F> = (
	facts: ReadFacts & { readonly where: (filter: Where<F>) => ReadFilter },
) => boolean | ReadFilter

/** One rule, or one rule per operation; `write` covers the three writes. */
export type ModelAccess<F, N extends string> =
	| ((
			facts:
				ReadFacts | CreateFacts<F, N> | UpdateFacts<F, N> | DeleteFacts<F, N>,
	  ) => boolean)
	| {
			readonly read?: ReadRule<F>
			readonly create?: (facts: CreateFacts<F, N>) => boolean
			readonly update?: (facts: UpdateFacts<F, N>) => boolean
			readonly delete?: (facts: DeleteFacts<F, N>) => boolean
			readonly write?: (
				facts: CreateFacts<F, N> | UpdateFacts<F, N> | DeleteFacts<F, N>,
			) => boolean
	  }

type Hook<Facts> = (
	facts: Facts & { readonly caller: Caller },
) => void | Promise<void>
type RecordHook<F, N extends string> = Hook<{
	readonly record: StoredRecord<F, N>
}>
type UpdatedHook<F, N extends string> = Hook<{
	readonly record: StoredRecord<F, N>
	readonly previous: StoredRecord<F, N>
}>
/** The data a `before*` hook changes in place (D-71). */
type Draft<D> = { -readonly [K in keyof D]: D[K] }

/**
 * What the rows a `beforeFind` narrows are for: an update or a delete of the
 * rows a write targets, a read everywhere else (D-124).
 */
export type FindOperation = 'read' | 'update' | 'delete'

/** The fixed hooks of D-15, written by the application (D-43, D-71). */
export type ModelHooks<F, N extends string = string> = {
	/**
	 * Narrows every read of the model, at every level, Master included;
	 * `operation` says whether the rows are read or written (D-124).
	 */
	readonly beforeFind?: (facts: {
		readonly caller: Caller
		readonly operation: FindOperation
		readonly where: (filter: FindWhere<F>) => ReadFilter
	}) => ReadFilter | void | Promise<ReadFilter | void>
	readonly beforeCreate?: Hook<{ readonly data: Draft<CreateData<F, N>> }>
	readonly beforeUpdate?: Hook<{
		readonly record: StoredRecord<F, N>
		readonly data: Draft<UpdateData<F, N, false>>
	}>
	readonly beforeDelete?: RecordHook<F, N>
	readonly afterCreate?: RecordHook<F, N>
	readonly afterUpdate?: UpdatedHook<F, N>
	readonly afterDelete?: RecordHook<F, N>
	readonly afterCreateCommit?: RecordHook<F, N>
	readonly afterUpdateCommit?: UpdatedHook<F, N>
	readonly afterDeleteCommit?: RecordHook<F, N>
}

/**
 * What a `many` relation's reads see, Master's too (D-151): a function
 * shaped like a read rule, typed from the target.
 */
type RelationFilter<T> = {
	readonly where: (facts: {
		readonly caller: Caller
		readonly where: (filter: Where<T>) => ReadFilter
	}) => boolean | ReadFilter
}

/** A filter for each `many` relation that has one (D-151). */
export type RelationFilters<F> = {
	readonly [
		K in keyof F as F[K] extends {
			readonly [fieldType]: { readonly kind: 'many' }
		}
			? K
			: never
	]?: F[K] extends { readonly [fieldType]: { readonly target: infer T } }
		? RelationFilter<TargetFields<T>>
		: never
}

/** The kernel's keys; `W` holds one key per plugin (D-42, D-151). */
export type ModelWith<F, W, N extends string> = {
	readonly access?: ModelAccess<F, N>
	readonly hooks?: ModelHooks<F, N>
	readonly relations?: RelationFilters<F>
	readonly virtuals?: VirtualRules<F>
} & W

/** `X` lists the fields of each unique index (D-52). */
export interface Model<N extends string, F, P, W, X = never> extends Queries<
	F,
	X,
	N
> {
	readonly name: N
	readonly [modelFields]: F
	/** The plugins it uses, checked against the application's (D-24). */
	readonly plugins?: P
	with(rules: ModelWith<F, W, N>): this
	/** The model, or `null`, as a function's output (D-109). */
	nullable(): Nullable<this>
}

export type FieldShape = {
	readonly [fieldType]: {
		readonly kind: 'scalar' | 'one' | 'many' | 'virtual'
		readonly options: object
	}
}

// Exact type equality, which `any` and optional keys do not pass.
type Same<A, B> =
	// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the test needs a free `T`
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false

type Exact<V> = (value: V) => V

// The record type a field's rules declare (D-44) lists some of the model's
// fields, each with the model's exact type, required. Checked here, where the
// fields are known; a mismatch fails against the model's type, so the error
// shows it. `any` fits both ways and gets a message instead.
type Expected<D, F> = {
	readonly [P in keyof D]-?: P extends keyof RecordOf<F>
		? Same<D[P], Exact<RecordOf<F>[P]>> extends true
			? D[P]
			: D[P] extends Exact<RecordOf<F>[P]>
				? `'${P & string}' does not have the model's exact type`
				: Exact<RecordOf<F>[P]>
		: `'${P & string}' is not a scalar field of the model`
}

// A field typed before the model cannot check its record against it.
export type RecordCheck<F> = {
	readonly [K in keyof F]: F[K] extends { readonly [declaredRecord]: infer D }
		? { readonly [declaredRecord]: Expected<D, F> }
		: unknown
}

/**
 * The plugins that provide the model's field types (D-32). Without
 * `exactOptionalPropertyTypes`, a field no plugin provides reads `undefined`.
 */
export type FieldTypePlugins<F> = {
	[K in keyof F]: F[K] extends {
		readonly [fieldType]: { readonly plugin?: infer P }
	}
		? P extends string
			? P
			: never
		: never
}[keyof F]

/** An index of `defineModel`, over one or several fields (D-52). */
export type IndexShape = {
	readonly fields: readonly string[]
	readonly unique?: boolean
	/** A trigram index, for `contains` and `mode: 'insensitive'` (D-141). */
	readonly contains?: true
}

/** The fields of each unique index. */
export type UniqueIndexFields<X> = X extends readonly (infer I)[]
	? I extends { readonly unique: true; readonly fields: infer K }
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
type NotIndexable<I, F> = I extends { readonly fields: readonly (infer K)[] }
	? Exclude<K, IndexableKeys<F>>
	: never

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
				ContainsCheck<X[I], F>
		}

export type ModelShape = {
	readonly name: string
	readonly [modelFields]: object
}

// An `inverse` names a field of the target (D-37). It is checked here, where
// every model is typed, since reading the target while declaring is a cycle.
type InverseErrors<N extends string, F> = {
	[K in keyof F]: F[K] extends {
		readonly [fieldType]: {
			readonly target: infer T
			readonly options: { readonly inverse: infer I extends string }
		}
	}
		? I extends keyof TargetFields<T>
			? never
			: `${N}.${K & string}: inverse '${I}' is not a field of the target`
		: never
}[keyof F]

type AppInverseErrors<M> = {
	[I in keyof M]: M[I] extends {
		readonly name: infer N extends string
		readonly [modelFields]: infer F
	}
		? InverseErrors<N, F>
		: never
}[number & keyof M]

/** Checked on the whole options object, as `ModelCheck` is. */
export type InverseCheck<M> = [AppInverseErrors<M>] extends [never]
	? unknown
	: { readonly inverseError: AppInverseErrors<M> }

/** The application `defineApp` returns (D-24, D-59). */
export interface App<M> {
	readonly models: M
	start(): Promise<void>
	stop(): Promise<void>
}
