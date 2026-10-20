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

/**
 * Standard Schema (standardschema.dev), the part the kernel reads. Its
 * specification asks for the interface to be copied, not imported.
 */
export interface StandardSchema<I = unknown, O = I> {
	readonly '~standard': {
		readonly version: 1
		readonly vendor: string
		readonly validate: (
			value: unknown,
		) => SchemaResult<O> | Promise<SchemaResult<O>>
		readonly types?: { readonly input: I; readonly output: O } | undefined
	}
}
type SchemaResult<O> =
	| { readonly value: O; readonly issues?: undefined }
	| { readonly issues: readonly { readonly message: string }[] }

/**
 * A field's `validate` (D-23): a Standard Schema, or a function that returns
 * the value to store and throws to refuse it.
 */
export type Validate<V> = StandardSchema<V, V> | ((value: V) => V | Promise<V>)

/** What shapes a scalar field (D-08, D-23, D-52, D-53). */
export type ScalarOptions<V> = {
	readonly optional?: boolean
	readonly unique?: boolean
	readonly default?: V | (() => V)
	readonly validate?: Validate<V>
}

type SchemaTypes<S> = S extends {
	readonly '~standard': { readonly types?: infer T }
}
	? NonNullable<T>
	: never
type IsAny<X> = 0 extends 1 & X ? true : false
type AnyCheck<S> =
	SchemaTypes<S> extends { readonly input: infer I; readonly output: infer O }
		? IsAny<I> extends true
			? { readonly validate: 'the schema types its input as any' }
			: IsAny<O> extends true
				? { readonly validate: 'the schema types its output as any' }
				: unknown
		: { readonly validate: 'the schema declares no types' }
// A schema is checked on its line: its input must take every value of the
// field, which the covariant `types` alone would not refuse.
type ValidateCheck<O, V> = O extends {
	readonly validate: infer S extends StandardSchema
}
	? unknown extends AnyCheck<S>
		? SchemaTypes<S> extends { readonly input: infer I }
			? [V] extends [I]
				? unknown
				: {
						readonly validate: 'the schema must accept every value of the field'
					}
			: unknown
		: AnyCheck<S>
	: unknown

/** What shapes a `json` field (D-53): its schema gives its types. */
export type JsonOptions = {
	readonly optional?: boolean
	readonly default?: unknown
	readonly validate?: StandardSchema | ((value: JsonValue) => unknown)
}
/** What a `json` field stores and returns: the schema's output. */
type JsonOutput<O> = O extends { readonly validate: infer S }
	? S extends StandardSchema
		? SchemaTypes<S>['output']
		: S extends (value: JsonValue) => infer R
			? Awaited<R>
			: unknown
	: unknown
/** What a `json` field is written: the schema's input. */
type JsonInput<O> = O extends { readonly validate: infer S }
	? S extends StandardSchema
		? SchemaTypes<S>['input']
		: JsonValue
	: JsonValue
// Defaults are validated (D-67), so a default is the schema's input.
type JsonCheck<O> = (O extends {
	readonly validate: infer S extends StandardSchema
}
	? AnyCheck<S>
	: unknown) &
	(O extends { readonly default: infer D }
		? [D] extends [JsonInput<O> | (() => JsonInput<O>)]
			? unknown
			: { readonly default: JsonInput<O> | (() => JsonInput<O>) }
		: unknown)

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
 * `V` is the stored value and `I` the written one, which differ when a
 * schema transforms (D-23). `P` names the plugin that provides the field
 * type (D-32); `T` is the types of the plugins the model uses, whose field
 * rules `.with` takes. Rules judge what the caller sent (D-67): they see `I`.
 */
export interface Field<V, O, P extends string = never, T = never, I = V> {
	readonly [fieldType]: {
		readonly kind: 'scalar'
		readonly value: V
		readonly input: I
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
			: FieldWith<NoInfer<R>, Written<I, O>, T>,
	): Field<V, O, P, never, I> & Declared<R>
	with(rules: FieldWith<never, Written<I, O>, T>): Field<V, O, P, never, I>
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
		options?: O & NoInfer<ValidateCheck<O, string>>,
	) => Field<string, O, never, T>
	readonly number: <
		const O extends ScalarOptions<number> = ScalarOptions<number>,
	>(
		options?: O & NoInfer<ValidateCheck<O, number>>,
	) => Field<number, O, never, T>
	readonly boolean: <
		const O extends ScalarOptions<boolean> = ScalarOptions<boolean>,
	>(
		options?: O & NoInfer<ValidateCheck<O, boolean>>,
	) => Field<boolean, O, never, T>
	readonly date: <const O extends ScalarOptions<Date> = ScalarOptions<Date>>(
		options?: O & NoInfer<ValidateCheck<O, Date>>,
	) => Field<Date, O, never, T>
	/**
	 * Without a schema, a `json` value is `unknown` and written as JSON; with
	 * one, it reads the schema's output and is written its input (D-53).
	 */
	readonly json: <const O extends JsonOptions = JsonOptions>(
		options?: O & NoInfer<JsonCheck<O>>,
	) => Field<JsonOutput<O>, O, never, T, JsonInput<O>>
	readonly enumOf: <
		const E extends string,
		const O extends ScalarOptions<E> = ScalarOptions<E>,
	>(
		values: readonly E[],
		options?: O & NoInfer<ValidateCheck<O, E>>,
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
