// Functions (D-27, D-45): a server operation with a Standard Schema input
// and a typed output, which `defineApp({ functions })` adds to the
// application.
import type { SchemaTypes, StandardSchema } from './fields.ts'
import type { ModelShape } from './model.ts'
import type { QueryOptions } from './query.ts'
import type { RecordOf } from './record.ts'
import type { Caller } from './rules.ts'
import type { modelFields } from './symbols.ts'

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
