// Field builders (D-09, D-12); a field's `.with` takes the rules of
// field-rules.ts (D-44).
import type { Declared, FieldWith } from './field-rules.ts'
import type { Caller } from './rules.ts'
import type { fieldType } from './symbols.ts'

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

/** A default's function form: `undefined` gives no value (D-53). */
export type DefaultFunction<V> = (facts: {
	readonly caller: Caller
}) => V | undefined

/** What shapes a scalar field (D-08, D-23, D-52, D-53). */
export type ScalarOptions<V> = {
	readonly optional?: boolean
	readonly unique?: boolean
	readonly default?: V | DefaultFunction<V>
	readonly validate?: Validate<V>
	/** The stored column's name, when the adapter's convention will not do (D-63). */
	readonly dbName?: string
}

/** A decimal's options: its digits are required (D-145). */
export type DecimalOptions = ScalarOptions<string> & {
	readonly precision: number
	readonly scale: number
}

/** A field's options without `list` (D-120, D-127). */
export type SingleOptions<V> = ScalarOptions<V> & { readonly list?: false }

/** A string's options: `search` adds it to its model's document (D-148). */
export type StringOptions = SingleOptions<string> & {
	readonly search?: boolean
}

/** What shapes a list of strings, numbers or enum values (D-120, D-127). */
export type ListOptions<V> = {
	readonly list: true
	readonly default?: readonly V[] | DefaultFunction<readonly V[]>
	readonly validate?: Validate<readonly V[]>
	readonly dbName?: string
}
// A list is `[]` when empty and may hold a value twice. The messages are
// objects, as OneCheck's.
type ListCheck<O> = (O extends { readonly optional: unknown }
	? {
			readonly optional: {
				readonly error: 'a list is [] when empty: it is never optional'
			}
		}
	: unknown) &
	(O extends { readonly unique: unknown }
		? { readonly unique: { readonly error: 'a list cannot be unique' } }
		: unknown) &
	(O extends { readonly search: unknown }
		? { readonly search: { readonly error: 'a list is not searched' } }
		: unknown)
type ListableCheck<O, V> = O extends { readonly list: true }
	? ListCheck<O> & ValidateCheck<O, readonly V[]>
	: ValidateCheck<O, V>
type Listable<V, O, T> = O extends { readonly list: true }
	? Field<readonly V[], O, never, T>
	: Field<V, O, never, T>

/** The types a Standard Schema declares, `never` without them. */
export type SchemaTypes<S> = S extends {
	readonly '~standard': { readonly types?: infer T }
}
	? NonNullable<T>
	: never
type IsAny<X> = 0 extends 1 & X ? true : false
/** Refuses a schema typed `any` or without types, under `validate`. */
export type AnyCheck<S> =
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
	// Any value; the function member types `caller`. JsonCheck checks it.
	readonly default?: DefaultFunction<unknown> | {} | null
	readonly validate?: StandardSchema | ((value: JsonValue) => unknown)
	readonly dbName?: string
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
		? [D] extends [JsonInput<O> | DefaultFunction<JsonInput<O>>]
			? unknown
			: { readonly default: JsonInput<O> | DefaultFunction<JsonInput<O>> }
		: unknown)

/** What shapes a `one` relation (D-37, D-54). */
export type OneOptions = {
	readonly optional?: boolean
	/** The target's id (D-53). */
	readonly default?:
		{ readonly id: string } | DefaultFunction<{ readonly id: string }>
	readonly onDelete?: 'cascade' | 'restrict' | 'setNull'
	readonly inverse?: string
	readonly dbName?: string
}
// `setNull` empties the relation, which only an optional one may be (D-54).
// The message is an object: a literal would empty the whole options type.
type OneCheck<O> = O extends { readonly optional: true }
	? unknown
	: O extends { readonly onDelete: 'setNull' }
		? {
				readonly onDelete: {
					readonly error: 'setNull needs an optional relation'
				}
			}
		: unknown

export type ManyOptions = { readonly inverse?: string }

/** An optional field may be written `null`. */
type Written<V, O> = O extends { readonly optional: true } ? V | null : V

/**
 * `V` is the stored value and `I` the written one, which differ when a
 * schema transforms (D-23). `P` names the plugin that provides the field
 * type (D-32); `T` is the types of the plugins the model uses, whose field
 * rules `.with` takes. Rules judge what the caller sent (D-67): they see `I`.
 * `J` marks a `json` field, which cannot be sorted (D-94); `S` is a plugin
 * field type's stored field, which a `beforeFind` filters (D-122).
 */
export interface Field<
	V,
	O,
	P extends string = never,
	T = never,
	I = V,
	J extends boolean = false,
	S = never,
> {
	readonly [fieldType]: {
		readonly kind: 'scalar'
		readonly value: V
		readonly input: I
		readonly options: O
		readonly plugin?: P
		readonly json: J
		readonly stored: S
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
	): Field<V, O, P, never, I, J, S> & Declared<R>
	with(
		rules: FieldWith<never, Written<I, O>, T>,
	): Field<V, O, P, never, I, J, S>
}

export type RelationValue = { readonly id: string }

/** What a `many` relation's write rule sees: the caller's lists (D-86). */
export type ManyValue = {
	readonly connect: readonly RelationValue[]
	readonly disconnect: readonly RelationValue[]
	/** The linked rows it deletes (D-138). */
	readonly delete: readonly RelationValue[]
	/** The rows it creates, by the ids the kernel gives them (D-128). */
	readonly create: readonly RelationValue[]
}

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
		rules: FieldWith<NoInfer<R>, ManyValue, U>,
	): Many<T, O> & Declared<R>
}

/**
 * The field builders, which only `defineModel`'s `fields` callback receives:
 * typed by the model's `use`, a field's `.with` takes those plugins' rules
 * (D-12, D-57).
 */
export interface FieldBuilders<T> {
	/**
	 * With `list: true`, a list of strings, `[]` when empty (D-120); with
	 * `search: true`, matched by its model's `_search` (D-148).
	 */
	readonly string: <
		const O extends StringOptions | ListOptions<string> = StringOptions,
	>(
		options?: O & NoInfer<ListableCheck<O, string>>,
	) => Listable<string, O, T>
	/**
	 * With `list: true`, a list of numbers, `[]` when empty (D-127); with
	 * `integer: true`, whole numbers from -2,147,483,648 to 2,147,483,647
	 * (D-132).
	 */
	readonly number: <
		const O extends (SingleOptions<number> | ListOptions<number>) & {
			readonly integer?: boolean
		} = SingleOptions<number>,
	>(
		options?: O & NoInfer<ListableCheck<O, number>>,
	) => Listable<number, O, T>
	/**
	 * Exact numbers of `precision` digits, `scale` of them after the point,
	 * read and written as strings at that scale: `'12.50'` (D-145).
	 */
	readonly decimal: <const O extends DecimalOptions>(
		options: O & NoInfer<ValidateCheck<O, string>>,
	) => Field<string, O, never, T>
	readonly boolean: <
		const O extends ScalarOptions<boolean> = ScalarOptions<boolean>,
	>(
		options?: O & NoInfer<ValidateCheck<O, boolean>>,
	) => Field<boolean, O, never, T>
	readonly dateTime: <
		const O extends ScalarOptions<Date> = ScalarOptions<Date>,
	>(
		options?: O & NoInfer<ValidateCheck<O, Date>>,
	) => Field<Date, O, never, T>
	/**
	 * Without a schema, a `json` value is `unknown` and written as JSON; with
	 * one, it reads the schema's output and is written its input (D-53).
	 */
	readonly json: <const O extends JsonOptions = JsonOptions>(
		options?: O & NoInfer<JsonCheck<O>>,
	) => Field<JsonOutput<O>, O, never, T, JsonInput<O>, true>
	/** With `list: true`, a list of its values, `[]` when empty (D-127). */
	readonly enumOf: <
		const E extends string,
		const O extends SingleOptions<E> | ListOptions<E> = SingleOptions<E>,
	>(
		values: readonly E[],
		options?: O & NoInfer<ListableCheck<O, E>>,
	) => Listable<E, O, T>
	readonly one: <M extends object, const O extends OneOptions = OneOptions>(
		target: M,
		options?: O & NoInfer<OneCheck<O>>,
	) => One<M, O, T>
	readonly many: <M extends object, const O extends ManyOptions = ManyOptions>(
		target: M,
		options?: O,
	) => Many<M, O, T>
}
