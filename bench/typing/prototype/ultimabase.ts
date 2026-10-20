// D-24: a model lists the plugins it uses, `defineModel({ use: [softDelete()] })`,
// and `defineApp({ database, plugins, models })` assembles the application
// (functions are not prototyped). A plugin's types travel with its values;
// nothing is declared globally.
import type {
	App,
	FieldShape,
	InverseCheck,
	Model,
	ModelShape,
	RecordCheck,
} from './model.ts'
import type { fieldType, modelFields, pluginTypes } from './symbols.ts'

/** A type computed from a model: `this['fields']` is the model's fields. */
export interface FromModel {
	readonly fields: unknown
	readonly out: unknown
}

/** What a plugin adds to a model that uses it. */
export interface UseTypes {
	/** Its commands (D-15). */
	readonly commands?: FromModel
	/** Its key of the model's `.with` (D-42). */
	readonly with?: FromModel
}

/** A plugin's entry in a model's `use`, named after the plugin. */
export interface ModelUse<P extends string, T extends UseTypes> {
	readonly plugin: P
	readonly [pluginTypes]: T
}

/** A plugin's value in the application's `plugins`. */
export interface PluginValue<P extends string> {
	readonly name: P
}

/** A storage adapter (D-02): its own slot, not a plugin. */
export interface Database {
	readonly adapter: string
}

type Out<C extends FromModel, F> = (C & { readonly fields: F })['out']

// The intersection of the used plugins' commands; `unknown` without any.
type CommandFn<U, F> =
	U extends ModelUse<string, { readonly commands: infer C extends FromModel }>
		? (value: Out<C, F>) => void
		: never
type Commands<U, F> = [U] extends [never]
	? unknown
	: CommandFn<U, F> extends (value: infer I) => void
		? I
		: unknown

/** Each used plugin's key of `.with`, typed by the model's fields. */
type WithKeys<U, F> = {
	readonly [
		V in U as V extends ModelUse<infer P, { readonly with: FromModel }>
			? P
			: never
	]?: V extends ModelUse<string, { readonly with: infer W extends FromModel }>
		? Out<W, F>
		: never
}

export declare function defineModel<
	const N extends string,
	const F extends { readonly [field: string]: FieldShape },
	const U extends readonly ModelUse<string, UseTypes>[] = [],
>(definition: {
	readonly name: N
	readonly use?: U
	readonly fields: F & NoInfer<RecordCheck<F>>
}): Model<N, F, U[number]['plugin'], WithKeys<U[number], F>> &
	Commands<U[number], F>

// Checked on the `defineApp` line, where every model is typed (D-24).
type Used<M> = M extends { readonly plugins?: infer P } ? P : never
type Missing<
	P extends readonly PluginValue<string>[],
	M extends readonly ModelShape[],
> = Exclude<Used<M[number]>, P[number]['name'] | undefined>
type PluginCheck<
	P extends readonly PluginValue<string>[],
	M extends readonly ModelShape[],
> = [Missing<P, M>] extends [never]
	? unknown
	: {
			readonly pluginError: `a model uses '${Missing<P, M> & string}', which is not in plugins`
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

export declare function defineApp<
	const P extends readonly PluginValue<string>[] = [],
	const M extends readonly ModelShape[] = [],
>(
	options: {
		readonly database: Database
		readonly plugins?: P
		readonly models: M & NoInfer<InverseCheck<M>>
	} & NoInfer<PluginCheck<P, M>> &
		NoInfer<ModelCheck<M>>,
): App<M>
