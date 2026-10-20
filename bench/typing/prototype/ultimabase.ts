// D-24: a model lists the plugins it uses, `defineModel({ use: [softDelete()] })`,
// and `defineApp({ database, plugins, models })` assembles the application
// (functions are not prototyped). A plugin's types travel with its values;
// nothing is declared globally.
import type {
	App,
	FieldShape,
	FieldTypePlugins,
	InverseCheck,
	Model,
	ModelHooks,
	ModelShape,
	RecordCheck,
} from './model.ts'
import type { FieldBuilders } from './fields.ts'
import type { Queries, UniqueWhere } from './query.ts'
import type { RecordOf } from './record.ts'
import type { Caller } from './rules.ts'
import type { fieldType, modelFields, pluginTypes } from './symbols.ts'

/**
 * What a plugin adds to the models that use it (D-57). `this['fields']` is
 * the fields of the model that lists the plugin in its `use`, and
 * `this['options']` the options of its entry there.
 */
export interface PluginTypes {
	/** Its name, the key of its `.with` (D-24). */
	readonly name: string
	readonly fields: unknown
	/** The value of the field whose `.with` holds its field rule. */
	readonly value: unknown
	/** Its entry's options, `softDelete({ ... })` (D-07). */
	readonly options?: object
	/** Its application value's options, `softDeletePlugin({ ... })` (D-24). */
	readonly appOptions?: object
	/** The plugins it needs, by their types (D-16). */
	readonly requires?: PluginTypes
	/** The plugins it uses when installed (D-16). */
	readonly optional?: PluginTypes
	/** What it offers other plugins (D-16). */
	readonly api?: object
	/** The fields it adds to the models that use it (D-07, D-15). */
	readonly adds?: { readonly [field: string]: FieldShape }
	/** Its commands (D-15). */
	readonly commands?: object
	/** Its key of the model's `.with` (D-42). */
	readonly with?: object
	/** Its key of a field's `.with`, read with `this['value']` (D-12). */
	readonly fieldWith?: object
}

/** A plugin's types for one model's fields. */
type ForModel<T, F> = T & { readonly fields: F }
/** What a plugin's own code sees of a model: the fields it adds. Other
 * fields are the model's, unknown to the plugin (D-57). */
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- no fields, not any value
type Own<T> = T extends { readonly adds: infer A } ? A : Record<never, never>
type EntryOptions<T> = T extends { readonly options: infer O extends object }
	? O
	: { readonly [option: string]: never }
type AppOptions<T> = T extends { readonly appOptions: infer O } ? O : never
type Requires<T> = T extends { readonly requires: infer R extends PluginTypes }
	? R['name']
	: never
type Optional<T> = T extends { readonly optional: infer R extends PluginTypes }
	? R['name']
	: never
type ApiOf<X> = X extends { readonly api: infer A } ? A : undefined
type Apis<T> = (T extends { readonly requires: infer R extends PluginTypes }
	? { readonly [X in R as X['name']]: ApiOf<X> }
	: unknown) &
	(T extends { readonly optional: infer R extends PluginTypes }
		? { readonly [X in R as X['name']]: ApiOf<X> | undefined }
		: unknown)

/** What the plugin's start and api receive: its application options. */
export interface PluginContext<T> {
	readonly options: [AppOptions<T>] extends [never]
		? { readonly [option: string]: never }
		: AppOptions<T>
	readonly plugins: Apis<T>
}

/** A plugin's entry in a model's `use`, named after the plugin. */
export interface ModelUse<P extends string, T> {
	readonly plugin: P
	readonly [pluginTypes]: T
}

/** A plugin's value in the application's `plugins`. */
export interface PluginValue<P extends string, R extends string = never> {
	readonly name: P
	readonly requires?: readonly R[]
}

/** A storage adapter (D-02): its own slot, not a plugin. */
export interface Database {
	readonly adapter: string
}

type HookFacts<F, K extends keyof ModelHooks<F>> = Parameters<
	NonNullable<ModelHooks<F>[K]>
>[0]
/** The hooks a plugin runs on every model that uses it (D-15). */
export type PluginHooks<F, O, A> = {
	readonly [K in keyof ModelHooks<unknown>]?: (
		facts: HookFacts<F, K> & PluginModel<F, O, A>,
	) => void | Promise<void>
}
/** `redirect` replaces an operation with another (D-15). */
export type PluginRedirects<F, O, A> = {
	readonly delete?: (
		facts: {
			readonly caller: Caller
			readonly where: UniqueWhere<F>
		} & PluginModel<F, O, A>,
	) => Promise<RecordOf<F>>
}

/** What a model gives a plugin's code. */
export interface PluginModel<F, O, A> {
	readonly queries: Queries<F>
	readonly options: O
	readonly plugins: A
}

type CodePart<T, K extends 'commands' | 'api', Out> = T extends {
	readonly [P in K]: object
}
	? { readonly [P in K]: Out }
	: { readonly [P in K]?: never }

/** A plugin's package, usually its imported `package.json` (D-57). */
export interface Manifest {
	readonly name: string
	readonly version: string
	/** The ranges of `ultimabase` and of the plugins it needs. */
	readonly peerDependencies?: { readonly [name: string]: string }
}

type PluginFn<N extends string> = (...args: never[]) => PluginValue<N, string>
// Each needed plugin's application value under its name (D-16): a missing,
// an extra or a swapped one is refused.
type Needs<K extends 'requires' | 'optional', N extends string> = [N] extends [
	never,
]
	? { readonly [P in K]?: never }
	: { readonly [P in K]: { readonly [X in N]: PluginFn<X> } }

/** What a plugin's author writes (D-57). */
export type PluginDefinition<T extends PluginTypes> = {
	readonly name: T['name']
	readonly manifest: Manifest
	/** The hooks it runs on each model that uses it. */
	readonly hooks?: PluginHooks<Own<T>, EntryOptions<T>, Apis<T>>
	readonly redirect?: PluginRedirects<Own<T>, EntryOptions<T>, Apis<T>>
	/** Runs once when the application starts (D-15). */
	readonly start?: (context: PluginContext<T>) => void | Promise<void>
} & CodePart<
	T,
	'commands',
	(
		model: PluginModel<Own<T>, EntryOptions<T>, Apis<T>>,
	) => ForModel<T, Own<T>>['commands']
> &
	CodePart<T, 'api', (context: PluginContext<T>) => T['api']> &
	Needs<'requires', Requires<T>> &
	Needs<'optional', Optional<T>>

/** A plugin's two values (D-24). */
export interface Plugin<T extends PluginTypes> {
	readonly plugin: (
		options?: AppOptions<T>,
	) => PluginValue<T['name'], Requires<T>>
	readonly use: PluginEntry<T>
}
/** Without options, the entry is the plugin's own types; with them, its
 * types read the options' literal values. */
export interface PluginEntry<T extends PluginTypes> {
	(): ModelUse<T['name'], T>
	<const O extends EntryOptions<T>>(
		options: O,
	): ModelUse<T['name'], T & { readonly options: O }>
}
/** The type of a plugin's entry function, for its export. */
export type UseOf<T extends PluginTypes> = Plugin<T>['use']
/** The type of a plugin's application value function, for its export. */
export type PluginOf<T extends PluginTypes> = Plugin<T>['plugin']

export declare function definePlugin<T extends PluginTypes>(
	definition: PluginDefinition<T>,
): Plugin<T>

// The intersection of the used plugins' commands; `unknown` without any.
type CommandFn<U, F> =
	U extends ModelUse<string, infer T>
		? T extends { readonly commands: object }
			? (value: ForModel<T, F>['commands']) => void
			: never
		: never
type Commands<U, F> = [CommandFn<U, F>] extends [never]
	? unknown
	: CommandFn<U, F> extends (value: infer I) => void
		? I
		: unknown

/** Each used plugin's key of `.with`, typed by the model's fields. */
type WithKeys<U, F> = {
	readonly [
		V in U as V extends ModelUse<infer P, infer T>
			? T extends { readonly with: object }
				? P
				: never
			: never
	]?: V extends ModelUse<string, infer T extends { readonly with: object }>
		? ForModel<T, F>['with']
		: never
}

/** The types of the plugins in a model's `use`. */
type UsedTypes<U> = U extends ModelUse<string, infer T> ? T : never

// The fields the used plugins add, merged with the model's own.
type AddFn<U> =
	U extends ModelUse<string, infer T>
		? T extends { readonly adds: infer A }
			? (value: A) => void
			: never
		: never
type Added<U> = [AddFn<U>] extends [never]
	? unknown
	: AddFn<U> extends (value: infer I) => void
		? I
		: unknown
type AllFields<F, U> = [Added<U>] extends [unknown]
	? unknown extends Added<U>
		? F
		: F & Added<U>
	: F & Added<U>

export declare function defineModel<
	const N extends string,
	const F extends { readonly [field: string]: FieldShape },
	const U extends readonly ModelUse<string, PluginTypes>[] = [],
>(definition: {
	readonly name: N
	readonly use?: U
	/** The only form: its builders know the plugins of `use` (D-12, D-57). */
	readonly fields: (
		fields: FieldBuilders<UsedTypes<U[number]>>,
	) => F & NoInfer<RecordCheck<F>>
}): Model<
	N,
	AllFields<F, U[number]>,
	U[number]['plugin'],
	WithKeys<U[number], AllFields<F, U[number]>>
> &
	Commands<U[number], AllFields<F, U[number]>>

// Checked on the `defineApp` line, where every model is typed (D-24).
type Used<M> =
	| (M extends { readonly plugins?: infer P } ? P : never)
	| (M extends { readonly [modelFields]: infer F }
			? FieldTypePlugins<F>
			: never)
type Missing<
	P extends readonly PluginValue<string, string>[],
	M extends readonly ModelShape[],
> = Exclude<Used<M[number]>, P[number]['name'] | undefined>
type RequiresOf<V> = V extends PluginValue<string, infer R> ? R : never
type Unmet<P extends readonly PluginValue<string, string>[]> = Exclude<
	RequiresOf<P[number]>,
	P[number]['name']
>
type PluginCheck<
	P extends readonly PluginValue<string, string>[],
	M extends readonly ModelShape[],
> = [Missing<P, M>] extends [never]
	? [Unmet<P>] extends [never]
		? unknown
		: {
				readonly pluginError: `a plugin requires '${Unmet<P> & string}', which is not in plugins`
			}
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
	const P extends readonly PluginValue<string, string>[] = [],
	const M extends readonly ModelShape[] = [],
>(
	options: {
		readonly database: Database
		readonly plugins?: P
		readonly models: M & NoInfer<InverseCheck<M>>
	} & NoInfer<PluginCheck<P, M>> &
		NoInfer<ModelCheck<M>>,
): App<M>
