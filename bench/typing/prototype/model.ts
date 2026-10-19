// The model `App.defineModel(...).with(...)` returns (D-07, D-24) and the
// application `App.build` assembles.
import type { Queries, Where } from './query.ts'
import type {
	CreateData,
	RecordOf,
	TargetFields,
	UpdateData,
} from './record.ts'
import type { Caller } from './rules.ts'
import type { declaredRecord, fieldType, modelFields } from './symbols.ts'

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

/** A model read rule cannot see the record: it may return a filter (D-10). */
type ReadRule<F> = (facts: ReadFacts) => boolean | { readonly where: Where<F> }

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

export interface Model<N extends string, F, W> extends Queries<F> {
	readonly name: N
	readonly [modelFields]: F
	with(rules: ModelWith<F, W>): this
}

/**
 * The intersection of an object's values, each plugin's contribution: an
 * `unknown` value adds nothing (in a union, it would absorb the others).
 */
export type IntersectValues<T> = {
	readonly [K in keyof T]: (value: T[K]) => void
}[keyof T] extends (value: infer I) => void
	? I
	: never

/** Keys of `App.defineModel` that no plugin declares fail with a message. */
export type OptionCheck<O, K> = {
	readonly [P in Exclude<keyof O, 'name' | 'fields'>]?: P extends K
		? unknown
		: {
				readonly error: `'${P & string}' is not a defineModel key of an installed plugin`
			}
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

export type RecordCheck<F> = {
	readonly [K in keyof F]: F[K] extends { readonly [declaredRecord]: infer D }
		? { readonly [declaredRecord]: Expected<D, F> }
		: unknown
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

/** The application `App.build` returns (D-24, D-59). */
export interface App<M> {
	readonly models: M
	start(): Promise<void>
	stop(): Promise<void>
}
