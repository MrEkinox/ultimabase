// The model `defineModel(...).with(...)` returns (D-07, D-24) and the
// application `defineApp` assembles.
import type { Codes, PublicError } from './errors.ts'
import type { Nullable, Paginated } from './function.ts'
import type { Page, PageQuery } from './page.ts'
import type { FindWhere, Queries, QueryOptions, Where } from './query.ts'
import type { ReadRecord } from './read-row.ts'
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
	codes,
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
	readonly record: StoredRecord<F>
	readonly value: UpdateData<F, N, false>
}
type DeleteFacts<F> = {
	readonly caller: Caller
	readonly operation: 'delete'
	readonly record: StoredRecord<F>
}

/** A filter; only the `where` a rule receives builds one (D-10, D-214). */
type ReadFilter = { readonly [readFilter]: true }
/**
 * A model read rule cannot see the record: it may return a filter (D-10).
 * TypeScript never checks a returned object for unknown keys, but it checks
 * an argument: `where({ ... })` refuses a misspelled key on its line.
 */
type ReadRule<F> = (
	facts: ReadFacts & { readonly where: (filter: Where<F>) => ReadFilter },
) => boolean | ReadFilter

/**
 * A model write rule may return a filter the written row matches, and the
 * error a row outside it throws (D-214).
 */
type WriteRule<Facts, F> = (
	facts: Facts & {
		readonly where: (filter: Where<F>, error?: PublicError) => ReadFilter
	},
) => boolean | ReadFilter

/** One rule, or one rule per operation; `write` covers the three writes. */
export type ModelAccess<F, N extends string> =
	| ((
			facts: ReadFacts | CreateFacts<F, N> | UpdateFacts<F, N> | DeleteFacts<F>,
	  ) => boolean)
	| {
			readonly read?: ReadRule<F>
			readonly create?: WriteRule<CreateFacts<F, N>, F>
			readonly update?: WriteRule<UpdateFacts<F, N>, F>
			readonly delete?: WriteRule<DeleteFacts<F>, F>
			readonly write?: WriteRule<
				CreateFacts<F, N> | UpdateFacts<F, N> | DeleteFacts<F>,
				F
			>
	  }

type Hook<Facts> = (
	facts: Facts & { readonly caller: Caller },
) => void | Promise<void>
type RecordHook<F> = Hook<{
	readonly record: StoredRecord<F>
}>
type UpdatedHook<F> = Hook<{
	readonly record: StoredRecord<F>
	readonly previous: StoredRecord<F>
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
		readonly record: StoredRecord<F>
		readonly data: Draft<UpdateData<F, N, false>>
	}>
	readonly beforeDelete?: RecordHook<F>
	readonly afterCreate?: RecordHook<F>
	readonly afterUpdate?: UpdatedHook<F>
	readonly afterDelete?: RecordHook<F>
	readonly afterCreateCommit?: RecordHook<F>
	readonly afterUpdateCommit?: UpdatedHook<F>
	readonly afterDeleteCommit?: RecordHook<F>
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

/**
 * A `one` view's filter, which reads no caller: it is checked once, against
 * the target's unique indexes (D-240).
 */
type OneViewFilter<T> = {
	readonly where: (facts: {
		readonly where: (filter: Where<T>) => ReadFilter
	}) => ReadFilter
}

/** A filter for each `many` relation that has one, and each `one` view. */
export type RelationFilters<F> = {
	readonly [
		K in keyof F as F[K] extends {
			readonly [fieldType]: { readonly kind: 'many' }
		}
			? K
			: F[K] extends OneView
				? K
				: never
	]?: F[K] extends { readonly [fieldType]: { readonly target: infer T } }
		? F[K] extends OneView
			? OneViewFilter<TargetFields<T>>
			: RelationFilter<TargetFields<T>>
		: never
}

type OneView = {
	readonly [fieldType]: {
		readonly kind: 'one'
		readonly options: { readonly from: string }
	}
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
	/**
	 * Adds the application's commands, typed by the interface `C` (D-217):
	 * `.commands<MatchCommands>(({ queries }) => ({ end: async (id) => … }))`.
	 */
	commands<
		C extends object = {
			readonly error: 'name the commands type: .commands<MatchCommands>(...)'
		},
	>(
		build: (model: { readonly queries: Queries<F, X, N> }) => NoInfer<C>,
	): this & C
	/** The model, or `null`, as a function's output (D-109). */
	nullable(): Nullable<this>
	/** A page of the model, as a function's output (D-182). */
	paginated(): Paginated<this>
	/** The rows `where` selects, which a transport pages and counts (D-182). */
	paginate(
		this: void,
		args?: PageQuery<F>,
		options?: QueryOptions,
	): Page<ReadRecord<F>>
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

// The `one` relations of `F` but its views, told without their target's
// fields, which a field typed before the model cannot read (D-184, D-240).
type OneKeys<F> = {
	[K in keyof F]: F[K] extends OneView
		? never
		: F[K] extends { readonly [fieldType]: { readonly kind: 'one' } }
			? K
			: never
}[keyof F]

// The row's side of a `within` names a `one` relation of the model, or `id`
// against the target's field, which its model's type would make circular
// (D-220); a `many`'s names a `one` relation of both (D-236).
type Within<A, K> =
	| OneKeys<A>
	| (K extends 'one' ? { readonly [field: string]: OneKeys<A> | 'id' } : never)
type WithinCheck<X, A> = X extends {
	readonly [fieldType]: {
		readonly kind: infer K
		readonly options: { readonly within: infer W }
	}
}
	? [W] extends [Within<A, K>]
		? unknown
		: {
				readonly [fieldType]: {
					readonly options: { readonly within: Within<A, K> }
				}
			}
	: unknown

// The `many` relations of `F` that store their rows, which a view reads.
type StoredManyKeys<F> = {
	[K in keyof F]: F[K] extends {
		readonly [fieldType]: {
			readonly kind: 'many'
			readonly options: { readonly inverse: string }
		}
	}
		? K
		: never
}[keyof F]

// A view's `from` names a `many` of the model that stores its rows (D-151,
// D-240).
type FromCheck<X, A> = X extends {
	readonly [fieldType]: {
		readonly kind: 'one' | 'many'
		readonly options: { readonly from: infer R }
	}
}
	? [R] extends [StoredManyKeys<A>]
		? unknown
		: {
				readonly [fieldType]: {
					readonly options: { readonly from: StoredManyKeys<A> }
				}
			}
	: unknown

// A field typed before the model cannot check its record against it, nor a
// virtual its `needs`, which may name a field a plugin adds (`A`) or a `one`
// relation, whose key the row may store (D-184).
export type RecordCheck<F, A = F> = {
	readonly [K in keyof F]: (F[K] extends {
		readonly [declaredRecord]: infer D
	}
		? { readonly [declaredRecord]: Expected<D, F> }
		: F[K] extends { readonly [fieldType]: { readonly kind: 'virtual' } }
			? {
					readonly [fieldType]: {
						readonly options: {
							readonly needs?: readonly (keyof RecordOf<A> | OneKeys<A>)[]
						}
					}
				}
			: unknown) &
		WithinCheck<F[K], A> &
		FromCheck<F[K], A>
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

export type ModelShape = {
	readonly name: string
	readonly [modelFields]: object
}

// An `inverse` names a field of the target (D-37), and so does a `within`
// (D-220); a `size` faces a `one` (D-242). They are checked here, where every
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

/**
 * The application `defineApp` returns (D-24, D-59), and the codes its
 * plugins' errors and issues carry (D-206, D-231).
 */
export interface App<M, C extends Codes = never> {
	readonly models: M
	readonly [codes]?: C
	start(): Promise<void>
	stop(): Promise<void>
}
