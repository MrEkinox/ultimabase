// Functions (D-27, D-45, D-109): a server operation with a Standard Schema
// input and a typed output, which `defineApp({ functions })` adds to the
// application, and the named objects its output may hold.
import type { AnyCheck, SchemaTypes, StandardSchema } from './fields.ts'
import type { ModelShape } from './model.ts'
import type { ModelUse, PluginTypes } from './plugin.ts'
import type { QueryOptions } from './query.ts'
import type { RecordOf } from './record.ts'
import type { Caller } from './rules.ts'
import type { modelFields, nullableOf, typeFields } from './symbols.ts'

/** `X.nullable()`: a model or a type, or `null` (D-109). */
export type Nullable<X> = { readonly [nullableOf]: X }

/** A `defineType`: a named object, which may hold a model (D-109). */
export interface ObjectType<N extends string, F> {
	readonly name: N
	readonly [typeFields]: F
	nullable(): Nullable<this>
}

type Named =
	ModelShape | { readonly name: string; readonly [typeFields]: object }

/**
 * What a function returns (D-109): a model or a type, one or `null`, a list
 * of one, or any Standard Schema.
 */
export type OutputSpec =
	Named | Nullable<Named> | readonly [Named] | StandardSchema

/** A `defineType`'s fields: any output but nothing. */
export type TypeFields = { readonly [field: string]: OutputSpec }

/** The value of an output: typed, never validated (D-45). */
export type OutputValue<O> = O extends { readonly [modelFields]: infer F }
	? RecordOf<F>
	: O extends { readonly [typeFields]: infer F }
		? { readonly [K in keyof F]: OutputValue<F[K]> }
		: O extends { readonly [nullableOf]: infer X }
			? OutputValue<X> | null
			: O extends StandardSchema
				? SchemaTypes<O>['output']
				: O extends readonly [infer X]
					? readonly OutputValue<X>[]
					: never

/** What `run` returns: nothing without an output. */
export type ResultOf<O> = [O] extends [undefined] ? void : OutputValue<O>

/**
 * A function's access rule reads the caller only: it runs before the input
 * is validated, so a closed function says nothing of its input (D-04).
 */
export type FunctionAccess = (facts: { readonly caller: Caller }) => boolean

export type FunctionWith<W> = { readonly access?: FunctionAccess } & W

/** What a caller passes to `run`: the input before validation (D-75). */
export type RunArgs<I> = [I] extends [StandardSchema]
	? readonly [input: SchemaTypes<I>['input'], options?: QueryOptions]
	: readonly [options?: QueryOptions]

export interface ServerFunction<N extends string, I, O, P, W> {
	readonly name: N
	/** The schemas the transports read (D-45). */
	readonly input: I
	readonly output: O
	/** The plugins it uses, checked against the application's (D-24). */
	readonly plugins?: P
	with(rules: FunctionWith<W>): this
	/** Checks access, validates the input, then runs it (D-75). */
	run(...args: RunArgs<I>): Promise<ResultOf<O>>
}

export type FunctionShape = {
	readonly name: string
	readonly output: OutputSpec | undefined
}

/** A plugin that exposes functions: it keys their `.with` (D-27). */
export type FunctionPlugin = PluginTypes & {
	readonly functionWith: object | false
}

/** Each used plugin's key of a function's `.with`. */
export type FunctionWithKeys<U> = {
	readonly [
		V in U as V extends ModelUse<infer P, FunctionPlugin> ? P : never
	]?: V extends ModelUse<string, infer T extends FunctionPlugin>
		? T['functionWith']
		: never
}

/** A cookie's attributes (D-113). */
export interface CookieOptions {
	/** In seconds. */
	readonly maxAge?: number
	readonly path?: string
	readonly domain?: string
	readonly httpOnly?: boolean
	readonly secure?: boolean
	readonly sameSite?: 'Strict' | 'Lax' | 'None'
}

/** Who calls a function through a transport (D-113). */
export interface Client {
	/** The connection's address, `''` when the transport has none. */
	readonly address: string
	/** Read from the request, written on the transport's HTTP response. */
	readonly cookies: {
		/** The request's cookie `name`, `undefined` when it sent none. */
		get(name: string): string | undefined
		set(name: string, value: string, options?: CookieOptions): void
		/** Its `path` and `domain` must be those it was set with. */
		clear(name: string, options?: CookieOptions): void
	}
}

/**
 * What `run` receives: the caller, its client when a transport calls it,
 * and the validated input if any (D-113).
 */
export type RunFacts<I> = {
	readonly caller: Caller
	readonly client: Client | undefined
} & ([I] extends [StandardSchema]
	? { readonly input: SchemaTypes<I>['output'] }
	: unknown)

/** Requires `query: true` when a plugin of `use` takes queries only (D-154). */
export type QueryCheck<U> = [
	Extract<U, ModelUse<string, { readonly queryOnly: true }>>,
] extends [never]
	? unknown
	: { readonly query: true }

/** Refuses an input typed `any` or without types (D-27). */
export type InputCheck<I> = [I] extends [StandardSchema]
	? AnyCheck<I> extends { readonly validate: infer M }
		? { readonly input: M }
		: unknown
	: unknown
