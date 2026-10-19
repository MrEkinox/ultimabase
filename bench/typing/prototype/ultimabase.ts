// D-24: models are declared from the application,
// `const App = UltimaBase.create({ database, plugins: [softDelete()] })` then
// `App.defineModel(...)`, and `App.build({ models })` assembles it
// (functions are not prototyped).
// A plugin's types travel with its value; nothing is declared globally.
import type {
	App,
	FieldShape,
	IntersectValues,
	InverseCheck,
	Model,
	ModelShape,
	OptionCheck,
	RecordCheck,
} from './model.ts'
import type { pluginTypes } from './symbols.ts'

/**
 * A type computed from a model: `this['fields']` and `this['options']` are
 * the model's fields and the value of the plugin's `defineModel` key.
 */
export interface FromModel {
	readonly fields: unknown
	readonly options: unknown
	readonly out: unknown
}

/** What a plugin adds to the types, named after it (D-42). */
export interface PluginTypes {
	readonly name: string
	/** Its `defineModel` key (D-07). */
	readonly option?: unknown
	/** What its `defineModel` key adds to the model (D-15 commands). */
	readonly commands?: FromModel
	/** Its key of a model's `.with`. */
	readonly with?: FromModel
}

export interface Plugin<T extends PluginTypes> {
	readonly [pluginTypes]: T
}

type Apply<K extends FromModel, F, O> = (K & {
	readonly fields: F
	readonly options: O
})['out']
type TypesOf<P extends readonly Plugin<PluginTypes>[]> =
	P[number][typeof pluginTypes]

type OptionKeys<P extends readonly Plugin<PluginTypes>[]> = {
	readonly [
		T in TypesOf<P> as T extends { readonly option: unknown }
			? T['name']
			: never
	]?: T['option']
}

type WithKeys<P extends readonly Plugin<PluginTypes>[], F> = {
	readonly [
		T in TypesOf<P> as T extends { readonly with: FromModel }
			? T['name']
			: never
	]?: T extends { readonly with: infer W extends FromModel }
		? Apply<W, F, unknown>
		: never
}

type Commands<
	P extends readonly Plugin<PluginTypes>[],
	F,
	O,
> = IntersectValues<{
	readonly [T in TypesOf<P> as T['name']]: T extends {
		readonly commands: infer C extends FromModel
	}
		? Apply<C, F, T['name'] extends keyof O ? O[T['name']] : undefined>
		: unknown
}>

/** A storage adapter (D-02): its own slot, not a plugin, so no keys. */
export interface Database {
	readonly adapter: string
}

export interface AppBuilder<P extends readonly Plugin<PluginTypes>[]> {
	defineModel<
		const N extends string,
		const F extends { readonly [field: string]: FieldShape },
		// oxlint-disable-next-line typescript/no-generated-empty-object-type -- resolves per plugin set
		const O extends OptionKeys<P> = {},
	>(
		definition: {
			readonly name: N
			readonly fields: F & NoInfer<RecordCheck<F>>
		} & O &
			// oxlint-disable-next-line typescript/no-generated-empty-object-type -- resolves per plugin set
			NoInfer<OptionCheck<O, keyof OptionKeys<P>>>,
	): Model<N, F, WithKeys<P, F>> & Commands<P, F, O>
	build<const M extends readonly ModelShape[]>(options: {
		readonly models: M & NoInfer<InverseCheck<M>>
	}): App<M>
}

export declare const UltimaBase: {
	create<const P extends readonly Plugin<PluginTypes>[] = []>(options: {
		readonly database: Database
		readonly plugins?: P
	}): AppBuilder<P>
}
