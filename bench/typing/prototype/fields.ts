// Field builders (D-09, D-12) and the rules a field's `.with` takes (D-44).
import type { RecordFor } from './record.ts'
import type { Caller } from './rules.ts'
import type { declaredRecord, fieldType } from './symbols.ts'

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue }

/** What shapes a scalar field (D-08, D-52, D-53). */
export type ScalarOptions<V> = {
	readonly optional?: boolean
	readonly unique?: boolean
	readonly default?: V | (() => V)
}

/** What shapes a `one` relation (D-37, D-54). */
export type OneOptions = {
	readonly optional?: boolean
	readonly onDelete?: 'cascade' | 'restrict' | 'setNull'
	readonly inverse?: string
}

export type ManyOptions = { readonly inverse?: string }

// `R` is the record type the developer declares for the rules (D-44). It
// never derives from the model, which is still being typed here: that would
// be a cycle (TS7022).
type FieldReadRule<R extends object> = (facts: {
	readonly caller: Caller
	readonly operation: 'read'
	readonly record: RecordFor<R>
}) => boolean
type FieldCreateRule<V> = (facts: {
	readonly caller: Caller
	readonly operation: 'create'
	readonly value: V
}) => boolean
type FieldUpdateRule<R extends object, V> = (facts: {
	readonly caller: Caller
	readonly operation: 'update'
	readonly record: RecordFor<R>
	readonly value: V
}) => boolean
type FieldWriteRule<R extends object, V> = (
	facts:
		| {
				readonly caller: Caller
				readonly operation: 'create'
				readonly value: V
		  }
		| {
				readonly caller: Caller
				readonly operation: 'update'
				readonly record: RecordFor<R>
				readonly value: V
		  },
) => boolean
type FieldRule<R extends object, V> = (
	facts:
		| {
				readonly caller: Caller
				readonly operation: 'read'
				readonly record: RecordFor<R>
		  }
		| {
				readonly caller: Caller
				readonly operation: 'create'
				readonly value: V
		  }
		| {
				readonly caller: Caller
				readonly operation: 'update'
				readonly record: RecordFor<R>
				readonly value: V
		  },
) => boolean

/** A field keeps its declared record type, which `defineModel` checks. */
// Each declared field is kept as `(value: T) => T`, which only the same `T`
// fits: a wider or a narrower type fails, and the error shows the model's.
type Declared<R> = [R] extends [never]
	? unknown
	: {
			readonly [declaredRecord]: {
				readonly [P in keyof R]: (value: R[P]) => R[P]
			}
		}

/** One rule, or one rule per operation (D-44). */
export type FieldAccess<R extends object, V> =
	| FieldRule<R, V>
	| {
			readonly read?: FieldReadRule<R>
			readonly create?: FieldCreateRule<V>
			readonly update?: FieldUpdateRule<R, V>
			readonly write?: FieldWriteRule<R, V>
	  }

/**
 * The rules of the model's plugins for one field, each under the plugin's
 * name and typed by the field's value (D-12, D-57).
 */
type PluginFieldRules<T, V> = {
	readonly [
		X in T as X extends {
			readonly name: infer N extends string
			readonly fieldWith: object
		}
			? N
			: never
	]?: X extends { readonly fieldWith: object }
		? (X & { readonly value: V })['fieldWith']
		: never
}

export type FieldWith<R extends object, V, T = never> = {
	readonly access?: FieldAccess<R, V>
} & PluginFieldRules<T, V>

/** An optional field may be written `null`. */
type Written<V, O> = O extends { readonly optional: true } ? V | null : V

/**
 * `P` names the plugin that provides the field type (D-32); `T` is the
 * types of the plugins the model uses, whose field rules `.with` takes.
 */
export interface Field<V, O, P extends string = never, T = never> {
	readonly [fieldType]: {
		readonly kind: 'scalar'
		readonly value: V
		readonly options: O
		readonly plugin?: P
	}
	/**
	 * `.with({ ... })` types `value` and `record.id`;
	 * `.with<{ status: 'draft' | 'published' }>` also types the record fields it
	 * declares, each with the model's exact type (D-44).
	 */
	// With a declared record, `.with<{ ... }>`; refused without one, so the
	// next signature applies.
	with<R extends object>(
		rules: [keyof R] extends [never]
			? never
			: FieldWith<NoInfer<R>, Written<V, O>, T>,
	): Field<V, O, P> & Declared<R>
	with(rules: FieldWith<never, Written<V, O>, T>): Field<V, O, P>
}

export type RelationValue = { readonly id: string }

// `T` is the target's thunk, constrained to `object` only: its return type
// is read lazily, in queries and at registration, never while declaring.
export interface One<T, O, U = never> {
	readonly [fieldType]: {
		readonly kind: 'one'
		readonly target: T
		readonly options: O
	}
	with<R extends object = never>(
		rules: FieldWith<NoInfer<R>, RelationValue | null, U>,
	): One<T, O> & Declared<R>
}

export interface Many<T, O, U = never> {
	readonly [fieldType]: {
		readonly kind: 'many'
		readonly target: T
		readonly options: O
	}
	with<R extends object = never>(
		rules: FieldWith<NoInfer<R>, readonly RelationValue[], U>,
	): Many<T, O> & Declared<R>
}

/**
 * The field builders, which only `defineModel`'s `fields` callback receives:
 * typed by the model's `use`, a field's `.with` takes those plugins' rules
 * (D-12, D-57).
 */
export interface FieldBuilders<T> {
	readonly string: <
		const O extends ScalarOptions<string> = ScalarOptions<string>,
	>(
		options?: O,
	) => Field<string, O, never, T>
	readonly number: <
		const O extends ScalarOptions<number> = ScalarOptions<number>,
	>(
		options?: O,
	) => Field<number, O, never, T>
	readonly boolean: <
		const O extends ScalarOptions<boolean> = ScalarOptions<boolean>,
	>(
		options?: O,
	) => Field<boolean, O, never, T>
	readonly date: <const O extends ScalarOptions<Date> = ScalarOptions<Date>>(
		options?: O,
	) => Field<Date, O, never, T>
	/** Without a schema, a `json` value is `unknown` (D-53). */
	readonly json: <
		const O extends ScalarOptions<JsonValue> = ScalarOptions<JsonValue>,
	>(
		options?: O,
	) => Field<unknown, O, never, T>
	readonly enumOf: <
		const E extends string,
		const O extends ScalarOptions<E> = ScalarOptions<E>,
	>(
		values: readonly E[],
		options?: O,
	) => Field<E, O, never, T>
	readonly one: <M extends object, const O extends OneOptions = OneOptions>(
		target: M,
		options?: O,
	) => One<M, O, T>
	readonly many: <M extends object, const O extends ManyOptions = ManyOptions>(
		target: M,
		options?: O,
	) => Many<M, O, T>
}
