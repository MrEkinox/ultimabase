// `defineApp` (D-24, D-59): the application's models and plugins, checked
// together on its line, and its `start` and `stop` (D-91).
import type { Adapter } from './adapter.ts'
import { remember } from './app-internals.ts'
import type { Logger, MasterKey } from './app-options.ts'
import type { FunctionShape } from './function.ts'
import { lifecycle } from './lifecycle.ts'
import type {
	App,
	FieldTypePlugins,
	InverseCheck,
	ModelShape,
} from './model.ts'
import type { PluginValue } from './plugin.ts'
import type { fieldType, modelFields } from './symbols.ts'

// Checked on the `defineApp` line, where every model is typed (D-24).
type Used<M> =
	| (M extends { readonly plugins?: infer P } ? P : never)
	| (M extends { readonly [modelFields]: infer F }
			? FieldTypePlugins<F>
			: never)
type Missing<P extends readonly PluginValue<string, string>[], X> = Exclude<
	Used<X>,
	P[number]['name'] | undefined
>
type RequiresOf<V> = V extends PluginValue<string, infer R> ? R : never
type Unmet<P extends readonly PluginValue<string, string>[]> = Exclude<
	RequiresOf<P[number]>,
	P[number]['name']
>
type PluginCheck<
	P extends readonly PluginValue<string, string>[],
	M extends readonly ModelShape[],
	Fn extends readonly FunctionShape[],
> = [Missing<P, M[number]>] extends [never]
	? [Missing<P, Fn[number]>] extends [never]
		? [Unmet<P>] extends [never]
			? unknown
			: {
					readonly pluginError: `a plugin requires '${Unmet<P> & string}', which is not in plugins`
				}
		: {
				readonly pluginError: `a function uses '${Missing<P, Fn[number]> & string}', which is not in plugins`
			}
	: {
			readonly pluginError: `a model uses '${Missing<P, M[number]> & string}', which is not in plugins`
		}

type Targets<X> = X extends { readonly [modelFields]: infer F }
	? {
			[K in keyof F]: F[K] extends {
				readonly [fieldType]: { readonly target: () => infer T }
			}
				? T extends { readonly name: infer N }
					? N
					: never
				: never
		}[keyof F]
	: never
type Unlisted<M extends readonly ModelShape[]> = Exclude<
	Targets<M[number]>,
	M[number]['name']
>
type ModelCheck<M extends readonly ModelShape[]> = [Unlisted<M>] extends [never]
	? unknown
	: {
			readonly modelError: `a relation points to '${Unlisted<M> & string}', which is not in models`
		}

export function defineApp<
	const P extends readonly PluginValue<string, string>[] = [],
	const M extends readonly ModelShape[] = [],
	const Fn extends readonly FunctionShape[] = [],
>(
	options: {
		readonly database: Adapter
		readonly plugins?: P
		readonly models: M
		readonly functions?: Fn
		readonly masterKey?: MasterKey
		readonly logger?: Logger
	} & NoInfer<PluginCheck<P, M, Fn>> &
		NoInfer<ModelCheck<M>> &
		NoInfer<InverseCheck<M>>,
): App<M> {
	return remember({ models: options.models, ...lifecycle(options) }, options)
}
