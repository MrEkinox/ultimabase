// Functions (D-27, D-45): a server operation with a Standard Schema input
// and a typed output, which `defineApp({ functions })` adds to the
// application.
import type { AnyCheck, SchemaTypes, StandardSchema } from './fields.ts'
import type { ModelShape } from './model.ts'
import type { QueryOptions } from './query.ts'
import type { RecordOf } from './record.ts'
import type { Caller } from './rules.ts'
import type { modelFields } from './symbols.ts'
import type { ModelUse, PluginTypes } from './ultimabase.ts'

/**
 * What a function returns (D-45): a model, a list of one, an object of
 * outputs or any Standard Schema.
 */
export type OutputSpec =
	| ModelShape
	| StandardSchema
	| readonly [ModelShape]
	| { readonly [key: string]: OutputSpec }

/** The value `run` returns for an output: typed, never validated (D-45). */
export type OutputValue<O> = O extends { readonly [modelFields]: infer F }
	? RecordOf<F>
	: O extends StandardSchema
		? SchemaTypes<O>['output']
		: O extends readonly [infer X]
			? readonly OutputValue<X>[]
			: { readonly [K in keyof O]: OutputValue<O[K]> }

// Without an input, `run` receives none.
type InputFacts<I> = [I] extends [StandardSchema]
	? { readonly input: SchemaTypes<I>['output'] }
	: unknown
type InputCheck<I> = [I] extends [StandardSchema]
	? AnyCheck<I> extends { readonly validate: infer M }
		? { readonly input: M }
		: unknown
	: unknown

/** A plugin that exposes functions: it keys their `.with` (D-27). */
export type FunctionPlugin = PluginTypes & {
	readonly functionWith: object | false
}

/** Each used plugin's key of a function's `.with`. */
type FunctionWithKeys<U> = {
	readonly [
		V in U as V extends ModelUse<infer P, FunctionPlugin> ? P : never
	]?: V extends ModelUse<string, infer T extends FunctionPlugin>
		? T['functionWith']
		: never
}

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
	run(...args: RunArgs<I>): Promise<OutputValue<O>>
}

export type FunctionShape = {
	readonly name: string
	readonly output: OutputSpec
}

export declare function defineFunction<
	const N extends string,
	const O extends OutputSpec,
	const I extends StandardSchema | undefined = undefined,
	const U extends readonly ModelUse<string, FunctionPlugin>[] = [],
>(
	definition: {
		readonly name: N
		readonly use?: U
		readonly input?: I
		readonly output: O
		readonly run: (
			facts: { readonly caller: Caller } & InputFacts<NoInfer<I>>,
		) => NoInfer<OutputValue<O>> | Promise<NoInfer<OutputValue<O>>>
	} & NoInfer<InputCheck<I>>,
): ServerFunction<N, I, O, U[number]['plugin'], FunctionWithKeys<U[number]>>
