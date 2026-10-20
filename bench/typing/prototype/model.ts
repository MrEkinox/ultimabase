// The model `defineModel(...).with(...)` returns (D-07, D-24) and the
// application `defineApp` assembles.
import type { Queries, Where } from './query.ts'
import type {
	CreateData,
	RecordOf,
	TargetFields,
	UpdateData,
} from './record.ts'
import type { Caller } from './rules.ts'
import type {
	declaredRecord,
	fieldType,
	modelFields,
	readFilter,
} from './symbols.ts'

type ReadFacts = { readonly caller: Caller; readonly operation: 'read' }
type CreateFacts<F> = {
	readonly caller: Caller
	readonly operation: 'create'
	readonly value: CreateData<F>
}
type UpdateFacts<F> = {
	readonly caller: Caller
	readonly operation: 'update'
	readonly record: RecordOf<F>
	readonly value: UpdateData<F>
}
type DeleteFacts<F> = {
	readonly caller: Caller
	readonly operation: 'delete'
	readonly record: RecordOf<F>
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
export type ModelAccess<F> =
	| ((
			facts: ReadFacts | CreateFacts<F> | UpdateFacts<F> | DeleteFacts<F>,
	  ) => boolean)
	| {
			readonly read?: ReadRule<F>
			readonly create?: (facts: CreateFacts<F>) => boolean
			readonly update?: (facts: UpdateFacts<F>) => boolean
			readonly delete?: (facts: DeleteFacts<F>) => boolean
			readonly write?: (
				facts: CreateFacts<F> | UpdateFacts<F> | DeleteFacts<F>,
			) => boolean
	  }

type Hook<Facts> = (
	facts: Facts & { readonly caller: Caller },
) => void | Promise<void>
type RecordHook<F> = Hook<{ readonly record: RecordOf<F> }>

/** The fixed hooks of D-15, written by the application (D-43). */
export type ModelHooks<F> = {
	readonly beforeFind?: Hook<{ readonly where: Where<F> }>
	readonly beforeCreate?: Hook<{ readonly data: CreateData<F> }>
	readonly beforeUpdate?: Hook<{
		readonly record: RecordOf<F>
		readonly data: UpdateData<F>
	}>
	readonly beforeDelete?: RecordHook<F>
	readonly afterFind?: Hook<{ readonly records: readonly RecordOf<F>[] }>
	readonly afterCreate?: RecordHook<F>
	readonly afterUpdate?: RecordHook<F>
	readonly afterDelete?: RecordHook<F>
	readonly afterCreateCommit?: RecordHook<F>
	readonly afterUpdateCommit?: RecordHook<F>
	readonly afterDeleteCommit?: RecordHook<F>
}

/** The kernel's keys; `W` holds one key per plugin (D-42). */
export type ModelWith<F, W> = {
	readonly access?: ModelAccess<F>
	readonly hooks?: ModelHooks<F>
} & W

/** `X` lists the fields of each unique index (D-52). */
export interface Model<N extends string, F, P, W, X = never> extends Queries<
	F,
	X
> {
	readonly name: N
	readonly [modelFields]: F
	/** The plugins it uses, checked against the application's (D-24). */
	readonly plugins?: P
	with(rules: ModelWith<F, W>): this
}

export type FieldShape = {
	readonly [fieldType]: {
		readonly kind: 'scalar' | 'one' | 'many'
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

/** The plugins that provide the model's field types (D-32). */
export type FieldTypePlugins<F> = {
	[K in keyof F]: F[K] extends {
		readonly [fieldType]: { readonly plugin?: infer P extends string }
	}
		? P
		: never
}[keyof F]

/** An index of `defineModel`, over one or several fields (D-52). */
export type IndexShape = {
	readonly fields: readonly string[]
	readonly unique?: boolean
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
			readonly [I in keyof X]: [NotIndexable<X[I], F>] extends [never]
				? unknown
				: {
						readonly fields: `'${NotIndexable<X[I], F> & string}' is not a scalar field or a one relation of the model`
					}
		}

export type ModelShape = {
	readonly name: string
	readonly [modelFields]: object
}

// An `inverse` names a field of the target (D-37). It is checked here, where
// every model is typed, since reading the target while declaring is a cycle.
type InverseErrors<F> = {
	[K in keyof F]: F[K] extends {
		readonly [fieldType]: {
			readonly target: infer T
			readonly options: { readonly inverse: infer I extends string }
		}
	}
		? I extends keyof TargetFields<T>
			? never
			: `${K & string}: inverse '${I}' is not a field of the target`
		: never
}[keyof F]

export type InverseCheck<M> = {
	readonly [I in keyof M]: M[I] extends { readonly [modelFields]: infer F }
		? [InverseErrors<F>] extends [never]
			? unknown
			: { readonly inverseError: InverseErrors<F> }
		: unknown
}

/** The application `defineApp` returns (D-24, D-59). */
export interface App<M> {
	readonly models: M
	start(): Promise<void>
	stop(): Promise<void>
}
