// A plugin is an interface of types and one `definePlugin` (D-57). Its types
// travel with its values; nothing is declared globally (D-24).
import type { Logger } from './app-options.ts'
import type { FieldBuilders, StandardSchema } from './fields.ts'
import type { Identify } from './identify.ts'
import { pluginEntries, pluginValues } from './definition.ts'
import { pluginCode } from './plugin-code.ts'
import type { FieldShape, ModelHooks, ModelShape } from './model.ts'
import type { Row, SchemaModel } from './adapter.ts'
import type { Queries, QueryOptions, UniqueWhere } from './query.ts'
import type { Caller } from './rules.ts'
import type { pluginTypes } from './symbols.ts'

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
	/** The fields it adds to the models that use it (D-07, D-15, D-89). */
	readonly addedFields?: { readonly [field: string]: FieldShape }
	/** Its commands (D-15). */
	readonly commands?: object
	/** Its key of the model's `.with` (D-42); `false` turns it off (D-107). */
	readonly with?: object | false
	/** Its key of a field's `.with`, read with `this['value']` (D-12). */
	readonly fieldWith?: object
	/** Its key of a function's `.with`; `false` stops exposing it (D-27). */
	readonly functionWith?: object | false
}

/** A plugin's types for one model's fields. */
export type ForModel<T, F> = T & { readonly fields: F }
/** What a plugin's own code sees of a model: the fields it adds. Other
 * fields are the model's, unknown to the plugin (D-57). */
type Own<T> = T extends { readonly addedFields: infer A }
	? A
	: // oxlint-disable-next-line typescript/no-generated-empty-object-type -- no fields, not any value
		Record<never, never>
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

type Args = { readonly [key: string]: unknown }
/** A model's queries as a transport calls them, with its client's arguments. */
export interface ModelQueries {
	findUnique(args: Args, options: QueryOptions): Promise<Row | null>
	findMany(args: Args, options: QueryOptions): Promise<readonly Row[]>
	count(args: Args, options: QueryOptions): Promise<number>
	create(args: Args, options: QueryOptions): Promise<Row>
	update(args: Args, options: QueryOptions): Promise<Row>
	delete(args: Args, options: QueryOptions): Promise<Row>
}

/** A model as transports and tools read it (D-16, D-107). */
export interface ExposedModel<W = unknown> {
	/** As the adapter receives it (D-73). */
	readonly schema: SchemaModel
	/** `id`, unique fields and unique indexes (D-52). */
	readonly uniques: readonly (readonly string[])[]
	/** Each field with a read rule, `private` when only Master reads it (D-44). */
	readonly readRules: { readonly [field: string]: 'private' | 'rule' }
	/** The fields `create` needs: neither optional nor with a default (D-53). */
	readonly required: readonly string[]
	/** The plugin's key of the model's `.with`, if it was given. */
	readonly with: W | undefined
	readonly queries: ModelQueries
}

/** How an output holds a model or a type (D-109). */
export type OutputForm = 'one' | 'nullable' | 'list'

/** A function's or a type's output, as transports read it (D-109). */
export type ExposedOutput =
	| { readonly kind: 'schema'; readonly schema: StandardSchema }
	| { readonly kind: 'model'; readonly name: string; readonly form: OutputForm }
	| {
			readonly kind: 'type'
			readonly type: ExposedType
			readonly form: OutputForm
	  }

/** A `defineType`, its fields in their order (D-109). */
export interface ExposedType {
	readonly name: string
	readonly fields: ReadonlyMap<string, ExposedOutput>
}

/** A function as transports read it (D-109). */
export interface ExposedFunction<W = unknown> {
	readonly name: string
	/** A query, which a transport may serve over GET; a mutation otherwise. */
	readonly query: boolean
	readonly input: StandardSchema | undefined
	/** `undefined` when it returns nothing. */
	readonly output: ExposedOutput | undefined
	/** The plugin's key of the function's `.with`, if it was given. */
	readonly with: W | undefined
	/** Checks access, validates the input, then runs it (D-75). */
	run(input: unknown, options: QueryOptions): Promise<unknown>
}

type WithOf<T> = T extends { readonly with: infer W } ? W : never
type FunctionWithOf<T> = T extends { readonly functionWith: infer W }
	? W
	: never

/** What the plugin's start and api receive: its application options. */
export interface PluginContext<T> {
	readonly options: [AppOptions<T>] extends [never]
		? { readonly [option: string]: never }
		: AppOptions<T>
	readonly plugins: Apis<T>
	readonly logger: Logger
	/** Who sends a request: what a transport runs it as (D-106). */
	readonly identify: Identify
	/** The application's models, in their order (D-107). */
	readonly models: readonly ExposedModel<WithOf<T>>[]
	/** The application's functions, in their order (D-109). */
	readonly functions: readonly ExposedFunction<FunctionWithOf<T>>[]
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

type HookFacts<F, K extends keyof ModelHooks<F>> = Parameters<
	NonNullable<ModelHooks<F>[K]>
>[0]
/**
 * The hooks a plugin runs on every model that uses it (D-15). `command` names
 * the plugin's command the operation was called through, on that model only
 * (D-71).
 */
export type PluginHooks<F, O, A, C> = {
	readonly [K in keyof ModelHooks<unknown>]?: (
		facts: HookFacts<F, K> &
			PluginModel<F, O, A> & { readonly command: C | undefined },
	) => ReturnType<NonNullable<ModelHooks<F>[K]>>
}
/** `redirect` replaces an operation with another (D-15). */
export type PluginRedirects<F, O, A> = {
	readonly delete?: (
		facts: {
			readonly caller: Caller
			readonly where: UniqueWhere<F>
		} & PluginModel<F, O, A>,
	) => Promise<unknown>
}

/** What a model gives a plugin's code. */
export interface PluginModel<F, O, A> {
	readonly queries: Queries<F>
	readonly options: O
	readonly plugins: A
}

type CodePart<T, K extends 'commands' | 'addedFields', Out> = T extends {
	readonly [P in K]: object
}
	? { readonly [P in K]: Out }
	: { readonly [P in K]?: never }

// A plugin without an API may still use the step that builds them, before
// any start, to call another plugin's API (D-107).
type ApiPart<T> = T extends { readonly api: object }
	? { readonly api: (context: PluginContext<T>) => T['api'] }
	: { readonly api?: (context: PluginContext<T>) => void }

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
	readonly hooks?: PluginHooks<
		Own<T>,
		EntryOptions<T>,
		Apis<T>,
		keyof ForModel<T, Own<T>>['commands'] & string
	>
	readonly redirect?: PluginRedirects<Own<T>, EntryOptions<T>, Apis<T>>
	/** Runs once when the application starts (D-15). */
	readonly start?: (context: PluginContext<T>) => void | Promise<void>
	/** Runs once when the application stops: close, flush (D-15). */
	readonly stop?: (context: PluginContext<T>) => void | Promise<void>
	/**
	 * Who sends a request, or `undefined` when it is not the plugin's; the
	 * first plugin to know it wins, after the master key (D-112).
	 */
	readonly identify?: (
		request: Request,
		context: PluginContext<T>,
	) => Promise<Caller | undefined>
	/** Its own models, which no plugin is given (D-110). */
	readonly models?: readonly ModelShape[]
} & CodePart<
	T,
	'commands',
	(
		model: PluginModel<Own<T>, EntryOptions<T>, Apis<T>>,
	) => ForModel<T, Own<T>>['commands']
> &
	ApiPart<T> &
	CodePart<
		T,
		'addedFields',
		(fields: FieldBuilders<never>, options: EntryOptions<T>) => Own<T>
	> &
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

export function definePlugin<T extends PluginTypes>(
	definition: PluginDefinition<T>,
): Plugin<T> {
	const code = pluginCode(definition)
	const plugin = (options?: object): PluginValue<string, string> => {
		const value = Object.freeze({ name: code.name, requires: code.requires })
		pluginValues.set(value, { code, options: options ?? {} })
		return value
	}
	const use = (options?: object): object => {
		const entry = Object.freeze({ plugin: code.name, options })
		pluginEntries.set(entry, { code, options: options ?? {} })
		return entry
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the two functions are Plugin<T>'s; their types follow T.
	return { plugin, use } as unknown as Plugin<T>
}
