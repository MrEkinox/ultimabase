// Stand-ins for what later Phase 2 slices build: functions (D-27, D-45)
// and the PostgreSQL adapter (D-02). Declared only.
import type { Adapter } from '../../../packages/ultimabase/src/adapter.ts'
import type {
	AnyCheck,
	SchemaTypes,
	StandardSchema,
} from '../../../packages/ultimabase/src/fields.ts'
import type {
	OutputSpec,
	OutputValue,
	ServerFunction,
} from '../../../packages/ultimabase/src/function.ts'
import type {
	ModelUse,
	PluginTypes,
} from '../../../packages/ultimabase/src/plugin.ts'
import type { Caller } from '../../../packages/ultimabase/src/rules.ts'

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

export declare function postgres(): Adapter
