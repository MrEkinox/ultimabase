// Form D (named): forms/d-hybrid/lib/core.ts plus name-keyed public models (`Model<"Todo">`),
// `findOne`, and query results that print the model name when nothing is selected.
// Form D (hybrid) Core model, `@ultimabase/core` entry point:
//   App.Schema.define({ className, fields })  -> generic, infers the fields only
//     .softDelete()                           -> shape methods contributed by plugins (no callback)
//     .with({ access, acl, hooks, ... })      -> ONE final non-generic call carrying every rule
// Core never names a plugin: rules come from a higher-kinded slot (`SchemaOptionsHKT`), shape
// methods from a schema-independent map (`ShapeMethod`), factories (`App.RoleSchema`) from
// `SchemaFactoriesHKT`. Types are adapted from lib-short/ (registry) and lib-f/ (factories).
// This file also contains a small runtime so that the fixture can be executed (runtime-check).

import type {
	CreateInput as NamedCreateInput,
	FieldsOf,
	FindManyArgs,
	FindOneArgs,
	Item,
	Model as NamedModel,
	PointerField,
	RelationField,
	ResolveTarget,
	Result,
	ScalarField,
	SchemaRef,
	SystemFields,
	UpdateInput as NamedUpdateInput,
} from './types.ts'

// `Model`, `CreateInput` and `UpdateInput` below shadow the star re-export (local exports win).
export type * from './types.ts'

// ---------------------------------------------------------------- public name-keyed utilities

/**
 * Complete stored model of one schema. Accepts the schema value type or its class name and
 * normalizes to the name, so `Model<typeof Todo>` prints `Model<"Todo">` once the application
 * is registered (`Register`); without it, the structural object is printed.
 * @example `const todo: Model<typeof Todo> = await Todo.findOne({ where: { id: { eq: id } } })`
 */
export type Model<TSchema> = SchemaRef<TSchema> extends infer TRef extends string ? NamedModel<TRef> : Item<TSchema>

/** Create input of one schema; prints `CreateInput<"Todo">` once registered. @example `const data: CreateInput<typeof Todo> = { title: 'x' }` */
export type CreateInput<TSchema> = SchemaRef<TSchema> extends infer TRef extends string ? NamedCreateInput<TRef> : NamedCreateInput<TSchema>

/** Update input of one schema; prints `UpdateInput<"Todo">` once registered. @example `const patch: UpdateInput<typeof Todo> = { archived: true }` */
export type UpdateInput<TSchema> = SchemaRef<TSchema> extends infer TRef extends string ? NamedUpdateInput<TRef> : NamedUpdateInput<TSchema>

/** Query result: the named model when nothing is selected or included, the exact structural object otherwise. */
export type QueryResult<TSchema, TArgs> = TArgs extends { readonly select: unknown } | { readonly include: unknown }
	? Simplify<Result<TSchema, TArgs>>
	: Model<TSchema>

// ---------------------------------------------------------------- application registry

/**
 * Application registry, declared once per application (optional, for short hovers):
 * `declare module '@ultimabase/core' { interface Register { readonly app: typeof ultimabase } }`.
 * Read lazily only (callback and query types), never while a schema constant is typed.
 */
export interface Register {}

// ---------------------------------------------------------------- field builder

/** Options shared by scalar fields. */
export interface ScalarOptions<TRequired extends boolean, TValue> {
	/** Requires a non-null value on creation. @example `required: true` */
	readonly required?: TRequired
	/** Value used when creation omits the field. */
	readonly default?: TValue
	/** Validates written values: `true` or an error message. @example `validate: (value) => value !== '' || 'empty'` */
	readonly validate?: (value: TValue) => true | string
	readonly description?: string
}

/** Relationship target: a thunk (`() => User`); kept unevaluated (see lib/core.ts). */
export type SchemaTarget = object

/** Options of one pointer field. */
export interface PointerOptions<TTarget, TRequired extends boolean> {
	/** Target schema. @example `target: () => User` */
	readonly target: TTarget
	readonly required?: TRequired
	readonly onDelete?: 'restrict' | 'cascade' | 'setNull'
}

/** Options of one relation field. */
export interface RelationOptions<TTarget, TMappedBy extends string | undefined> {
	/** Target schema. @example `target: () => Todo` */
	readonly target: TTarget
	/** Pointer field of the target that owns this inverse relation. @example `mappedBy: 'assignee'` */
	readonly mappedBy?: TMappedBy
}

/** Shared enum declared once with `defineEnum('TodoPriority', [...])`. */
export interface EnumDefinition<TName extends string = string, TValues extends readonly string[] = readonly string[]> {
	readonly enumName: TName
	readonly values: TValues
}

/** Enum values: inline (`values: [...]`) or a shared enum (`enum: TodoPriority`). */
export type EnumSource<TValues extends readonly string[]> = { readonly values: TValues } | { readonly enum: EnumDefinition<string, TValues> }

/** Field factory passed to `fields: (field) => ({ ... })`. */
export interface FieldBuilder {
	string<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, string>): ScalarField<'string', string, TRequired>
	int<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, number>): ScalarField<'int', number, TRequired>
	boolean<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, boolean>): ScalarField<'boolean', boolean, TRequired>
	date<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, Date>): ScalarField<'date', Date, TRequired>
	enum<const TValues extends readonly string[], const TRequired extends boolean = false>(
		options: ScalarOptions<TRequired, TValues[number]> & EnumSource<TValues>,
	): ScalarField<'enum', TValues[number], TRequired>
	enumList<const TValues extends readonly string[], const TRequired extends boolean = false>(
		options: ScalarOptions<TRequired, readonly TValues[number][]> & EnumSource<TValues>,
	): ScalarField<'enumList', readonly TValues[number][], TRequired>
	pointer<const TTarget extends SchemaTarget, const TRequired extends boolean = false>(
		options: PointerOptions<TTarget, TRequired>,
	): PointerField<TTarget, TRequired>
	relation<const TTarget extends SchemaTarget, const TMappedBy extends string | undefined = undefined>(
		options: RelationOptions<TTarget, TMappedBy>,
	): RelationField<TTarget, TMappedBy>
}

/** Declares one shared enum. @example `export const TodoPriority = defineEnum('TodoPriority', ['low', 'normal', 'high'])` */
export const defineEnum = <const TName extends string, const TValues extends readonly string[]>(
	enumName: TName,
	values: TValues,
): EnumDefinition<TName, TValues> => Object.freeze({ enumName, values })

/** Runtime description of one field; the typed members (`'~value'`, `'~target'`...) are phantom. */
export interface FieldDescriptor {
	readonly kind: string
	readonly options: Readonly<Record<string, unknown>>
}

// Phantom members exist only in types: the one cast between runtime descriptors and typed fields.
const typed = <TField>(kind: string, options: object | undefined): TField =>
	Object.freeze({ kind, options: Object.freeze({ ...options }) }) as unknown as TField

const builder: FieldBuilder = {
	string: (options) => typed('string', options),
	int: (options) => typed('int', options),
	boolean: (options) => typed('boolean', options),
	date: (options) => typed('date', options),
	enum: (options) => typed('enum', options),
	enumList: (options) => typed('enumList', options),
	pointer: (options) => typed('pointer', options),
	relation: (options) => typed('relation', options),
}

/** Runtime field builder. */
export const fieldBuilder: FieldBuilder = Object.freeze(builder)

// ---------------------------------------------------------------- plugin type contributions

/**
 * Higher-kinded rules slot: a plugin writes `interface X extends SchemaOptionsHKT {
 * readonly options: AccessSchemaOption<this['schema']> }`; Core substitutes the schema.
 */
export interface SchemaOptionsHKT {
	readonly schema: unknown
	readonly options: object
}

/** Plugin without rules. */
export interface NoSchemaOptions extends SchemaOptionsHKT {
	readonly options: Readonly<Record<never, never>>
}

/**
 * One shape method (`.softDelete()`): its arguments and the fields it adds. Shape methods
 * never see the schema (no callback), so they cannot create initializer cycles.
 */
export interface ShapeMethod<TArgs extends readonly unknown[] = readonly [], TFields extends object = Readonly<Record<never, never>>> {
	readonly '~args': TArgs
	readonly '~fields': TFields
}

/** Higher-kinded slot for schema factories on the application (`App.RoleSchema`). */
export interface SchemaFactoriesHKT {
	readonly app: AppTypes
	readonly factories: object
}

/** Plugin with no schema factory. */
export interface NoSchemaFactories extends SchemaFactoriesHKT {
	readonly factories: Readonly<Record<never, never>>
}

/** Runtime part of a plugin, read by Core generically. */
export interface PluginRuntime {
	/** Keys this plugin owns in `.with({ ... })`. */
	readonly ruleKeys?: readonly string[]
	/** Fields added to every schema. */
	readonly fields?: (field: FieldBuilder) => Readonly<Record<string, unknown>>
	/** Shape methods: name -> fields added. */
	readonly shapeMethods?: Readonly<Record<string, (field: FieldBuilder, ...args: readonly unknown[]) => Readonly<Record<string, unknown>>>>
	/** Schema factories exposed on the configured application. */
	readonly factories?: Readonly<Record<string, (kit: SchemaKit) => object>>
	/** Factories that must create exactly one registered schema. */
	readonly requiredFactories?: readonly string[]
}

/** Static type contribution and runtime part of one installed plugin. */
export interface PluginDefinition<
	TId extends string = string,
	TOptions extends SchemaOptionsHKT = SchemaOptionsHKT,
	TFields extends object = object,
	TShapes extends object = object,
	TFactories extends SchemaFactoriesHKT = SchemaFactoriesHKT,
	TRequired extends string = string,
> {
	readonly id: TId
	readonly runtime: PluginRuntime
	readonly '~schemaOptions'?: TOptions
	readonly '~fields'?: TFields
	readonly '~shapes'?: TShapes
	readonly '~schemaFactories'?: TFactories
	readonly '~requiredFactories'?: TRequired
}

type ApplyOptions<THKT, TSchema> = THKT extends SchemaOptionsHKT ? (THKT & { readonly schema: TSchema })['options'] : unknown

/** Every installed rules slot evaluated against one schema (tuple: see lib/core.ts on TS2589). */
export type SchemaOptionsFor<THKTs, TSchema> = THKTs extends readonly [infer THead, ...infer TRest]
	? ApplyOptions<THead, TSchema> & SchemaOptionsFor<TRest, TSchema>
	: unknown

/** Type-level configuration of one configured application. */
export interface AppTypes<THKTs = unknown, TAdded = unknown, TShapes = unknown> {
	readonly '~hkts': THKTs
	readonly '~added': TAdded
	readonly '~shapes': TShapes
}

/** Complete field map: declared fields, Core system fields and plugin fields. */
export type CompleteFields<TDeclared, TAdded> = Readonly<TDeclared & SystemFields & TAdded>

// ---------------------------------------------------------------- schema

/** Runs one query with Master authority (server-side only, never from transport input). */
export interface QueryOptions {
	readonly useMasterKey?: boolean
}

/** Static query surface; `this` is the schema itself. */
export interface SchemaQueries {
	findMany<TSelf, const TArgs extends FindManyArgs<TSelf> = Readonly<Record<never, never>>>(
		this: TSelf,
		args?: TArgs,
		options?: QueryOptions,
	): Promise<QueryResult<TSelf, TArgs>[]>
	findOne<TSelf, const TArgs extends FindOneArgs<TSelf>>(this: TSelf, args: TArgs, options?: QueryOptions): Promise<QueryResult<TSelf, TArgs> | null>
	createOne<TSelf, const TArgs extends CreateArgs<TSelf>>(this: TSelf, args: TArgs, options?: QueryOptions): Promise<QueryResult<TSelf, TArgs>>
}

/** Prints the resolved object in editors instead of the alias. */
export type Simplify<TValue> = { [K in keyof TValue]: TValue[K] } & {}

/** Arguments of `createOne`. */
export interface CreateArgs<TSchema> extends Omit<FindManyArgs<TSchema>, 'where' | 'orderBy' | 'limit' | 'offset'> {
	readonly data: CreateInput<TSchema>
}

/** One defined schema (what `.with` and queries see). */
export interface DefinedSchema<TName extends string, TFields, TApp extends AppTypes> extends SchemaQueries {
	readonly className: TName
	readonly '~fields': CompleteFields<TFields, TApp['~added']>
}

type ShapeArgs<TMethod> = TMethod extends ShapeMethod<infer TArgs, object> ? TArgs : never
type ShapeFields<TMethod> = TMethod extends ShapeMethod<readonly unknown[], infer TFields> ? TFields : never

/** Shape methods not called yet; each is one non-generic signature. */
export type ShapeMethods<TName extends string, TFields, TApp extends AppTypes, TUsed extends PropertyKey, TModel> = {
	readonly [K in Exclude<keyof TApp['~shapes'], TUsed> & string]: (
		...args: ShapeArgs<TApp['~shapes'][K]>
	) => Schema<TName, TFields & ShapeFields<TApp['~shapes'][K]>, TApp, TUsed | K, TModel>
}

/** The final rules call. */
export interface RulesMethod<TName extends string, TFields, TApp extends AppTypes, TModel> {
	/**
	 * Adds the rules of the installed plugins (access, acl, hooks, postgres...), typed against
	 * the complete schema. One non-generic call, last in the chain.
	 * @example `.with({ access: { read: true } })`
	 */
	with(rules: SchemaOptionsFor<TApp['~hkts'], SchemaRef<DefinedSchema<TName, TFields, TApp>>>): ConfiguredSchema<TName, TFields, TApp, TModel>
}

/** Value returned by `define(...)` and by each shape method. */
export type Schema<TName extends string, TFields, TApp extends AppTypes, TUsed extends PropertyKey, TModel> = DefinedSchema<TName, TFields, TApp> &
	ShapeMethods<TName, TFields, TApp, TUsed, TModel> &
	RulesMethod<TName, TFields, TApp, TModel> &
	TModel

/** Value returned by `.with(...)`: the registered schema. */
export type ConfiguredSchema<TName extends string, TFields, TApp extends AppTypes, TModel> = DefinedSchema<TName, TFields, TApp> & TModel

/** Schema created by a plugin factory: plugin-owned fields, model methods and a factory brand. */
export type FactorySchema<TFactory extends string, TName extends string, TFields, TApp extends AppTypes, TModel = unknown> =
	// Normalizes `AppTypes & AppTypes<...>` (from the HKT substitution) so hovers print one AppTypes.
	TApp extends { readonly '~hkts': infer THKTs; readonly '~added': infer TAdded; readonly '~shapes': infer TShapes }
		? Schema<TName, TFields, AppTypes<THKTs, TAdded, TShapes>, never, TModel & { readonly '~factory': TFactory }>
		: never

/** Declaration of one schema. */
export interface SchemaDeclaration<TName extends string, TFields> {
	/** Runtime class name. */
	readonly className: TName
	/** Field declarations; relation targets are thunks (`() => User`). */
	readonly fields: (field: FieldBuilder) => TFields
}

/** Schema namespace of one configured application. */
export interface SchemaNamespace<TApp extends AppTypes> {
	/** Declares fields; then shape methods (`.softDelete()`), then `.with({ ...rules })`. */
	define<const TName extends string, const TFields>(declaration: SchemaDeclaration<TName, TFields>): Schema<TName, TFields, TApp, never, unknown>
}

// ---------------------------------------------------------------- registration (types)

type NameOf<TSchema> = TSchema extends { readonly className: infer TName extends string } ? TName : never

type RelationIssues<TSchema> = {
	[K in keyof FieldsOf<TSchema>]: FieldsOf<TSchema>[K] extends RelationField<infer TTarget, infer TMappedBy>
		? TMappedBy extends string
			? TMappedBy extends keyof FieldsOf<ResolveTarget<TTarget>>
				? never
				: `${NameOf<TSchema>}.${K & string}: mappedBy '${TMappedBy}' is not a field of ${NameOf<ResolveTarget<TTarget>>}`
			: never
		: never
}[keyof FieldsOf<TSchema>]

/** Registration error shown in place of one invalid schema. */
export interface SchemaRegistrationError<TMessage extends string> {
	readonly '~error': TMessage
}

type FactoryOf<TSchema> = TSchema extends { readonly '~factory': infer TFactory extends string } ? TFactory : never

/** A plugin factory creates at most one registered schema (compared against the tuple union: linear). */
type FactoryIssues<TSchemas extends readonly unknown[], TSchema> = TSchema extends { readonly '~factory': infer TFactory extends string }
	? [Exclude<Extract<TSchemas[number], { readonly '~factory': TFactory }>, TSchema>] extends [never]
		? never
		: `${NameOf<TSchema>}: factory '${TFactory}' already created another registered schema`
	: never

/** Each registered schema, or a readable error instead of it. */
export type CheckedSchemas<TSchemas extends readonly unknown[]> = {
	readonly [K in keyof TSchemas]: [RelationIssues<TSchemas[K]> | FactoryIssues<TSchemas, TSchemas[K]>] extends [never]
		? TSchemas[K]
		: SchemaRegistrationError<RelationIssues<TSchemas[K]> | FactoryIssues<TSchemas, TSchemas[K]>>
}

type MissingFactories<TSchemas extends readonly unknown[], TRequired extends string> = TRequired extends FactoryOf<TSchemas[number]> ? never : TRequired

/** Registration options; a required factory without its schema adds an impossible member. */
export type ApplicationOptions<TSchemas extends readonly unknown[], TRequired extends string> = {
	readonly schemas: TSchemas & CheckedSchemas<TSchemas>
} & ([MissingFactories<TSchemas, TRequired>] extends [never]
	? unknown
	: { readonly '~missing': SchemaRegistrationError<`no registered schema created by factory '${MissingFactories<TSchemas, TRequired>}'`> })

/** One application instance. */
export interface Application<TSchemas extends readonly unknown[]> {
	readonly schemas: TSchemas
	/** What registration collected: fields and plugin rules per schema. */
	describe(): readonly RegisteredSchema[]
	/** Rules owned by one plugin, per class name. */
	rulesOf(pluginId: string): ReadonlyMap<string, unknown>
	start(): Promise<void>
}

type PluginOptionsHKT<TPlugin> = TPlugin extends { readonly '~schemaOptions'?: infer THKT extends SchemaOptionsHKT } ? THKT : NoSchemaOptions
type PluginFields<TPlugin> = TPlugin extends { readonly '~fields'?: infer TFields extends object } ? TFields : unknown
type PluginShapes<TPlugin> = TPlugin extends { readonly '~shapes'?: infer TShapes extends object } ? TShapes : unknown
type PluginFactoriesHKT<TPlugin> = TPlugin extends { readonly '~schemaFactories'?: infer THKT extends SchemaFactoriesHKT } ? THKT : NoSchemaFactories
type PluginRequired<TPlugin> = TPlugin extends { readonly '~requiredFactories'?: infer TRequired extends string } ? TRequired : never

type ApplyFactories<THKT, TApp> = THKT extends SchemaFactoriesHKT ? (THKT & { readonly app: TApp })['factories'] : unknown

/** Factories of every installed slot, evaluated against the final application configuration. */
export type SchemaFactoriesFor<TFactoryHKTs, TApp> = TFactoryHKTs extends readonly [infer THead, ...infer TRest]
	? ApplyFactories<THead, TApp> & SchemaFactoriesFor<TRest, TApp>
	: unknown

type Installed<TPlugins, THKTs extends readonly unknown[], TAdded, TShapes, TFactoryHKTs extends readonly unknown[], TRequired extends string> =
	TPlugins extends readonly [infer TPlugin, ...infer TRest]
		? Installed<
				TRest,
				readonly [...THKTs, PluginOptionsHKT<TPlugin>],
				TAdded & PluginFields<TPlugin>,
				TShapes & PluginShapes<TPlugin>,
				readonly [...TFactoryHKTs, PluginFactoriesHKT<TPlugin>],
				TRequired | PluginRequired<TPlugin>
			>
		: Factory<AppTypes<THKTs, TAdded, TShapes>, TFactoryHKTs, TRequired>

/** Immutable configured application factory returned by `UltimaBase.use(...)`. */
export interface ConfiguredFactory<TApp extends AppTypes, TFactoryHKTs extends readonly unknown[], TRequired extends string> {
	/** Installs plugins; returns a new configured factory. */
	use<const TPlugins extends readonly PluginDefinition[]>(
		...plugins: TPlugins
	): TApp extends AppTypes<infer THKTs extends readonly unknown[], infer TAdded, infer TShapes>
		? Installed<TPlugins, THKTs, TAdded, TShapes, TFactoryHKTs, TRequired>
		: never
	/** Plain schemas. */
	readonly Schema: SchemaNamespace<TApp>
	new <const TSchemas extends readonly unknown[]>(options: ApplicationOptions<TSchemas, TRequired>): Application<TSchemas>
}

/** Configured factory plus the schema factories of installed plugins (`App.RoleSchema`). */
export type Factory<TApp extends AppTypes, TFactoryHKTs extends readonly unknown[], TRequired extends string> = ConfiguredFactory<TApp, TFactoryHKTs, TRequired> &
	SchemaFactoriesFor<TFactoryHKTs, TApp>

// ---------------------------------------------------------------- runtime

/** Declaration accepted by Core's schema kit (used by `define` and by plugin factories). */
export interface RuntimeDeclaration {
	readonly className: string
	readonly fields?: (field: FieldBuilder) => object
	readonly factory?: string
	readonly model?: Readonly<Record<string, unknown>>
}

/** What a plugin factory receives from Core. */
export interface SchemaKit {
	define(declaration: RuntimeDeclaration): object
}

interface SchemaState {
	readonly declaration: RuntimeDeclaration
	readonly shapes: readonly { readonly method: string; readonly fields: Readonly<Record<string, unknown>> }[]
	readonly rules: object | undefined
}

/** Collected registration of one schema. */
export interface RegisteredSchema {
	readonly className: string
	readonly factory: string | undefined
	readonly fields: Readonly<Record<string, string>>
	readonly shapeMethods: readonly string[]
	readonly rules: Readonly<Record<string, unknown>>
}

const stateKey = '~state'

const isDescriptor = (value: unknown): value is FieldDescriptor =>
	typeof value === 'object' && value !== null && 'kind' in value && typeof value.kind === 'string' && 'options' in value

const stateOf = (value: unknown): SchemaState => {
	if (typeof value !== 'object' || value === null || !(stateKey in value)) throw new TypeError('Not a schema defined by UltimaBase')
	const state: unknown = Reflect.get(value, stateKey)
	if (typeof state !== 'object' || state === null || !('declaration' in state)) throw new TypeError('Corrupted schema state')
	// Written only by createSchema below.
	return state as SchemaState
}

const createSchema = (state: SchemaState, plugins: readonly PluginDefinition[]): object => {
	const used = new Set(state.shapes.map((shape) => shape.method))
	const entries: [string, unknown][] = [
		['className', state.declaration.className],
		[stateKey, state],
		['findMany', async () => []],
		['findOne', async () => null],
		['createOne', async (args: { readonly data: object }) => ({ id: 'new', ...args.data })],
		...Object.entries(state.declaration.model ?? {}),
	]
	if (state.rules === undefined) {
		for (const plugin of plugins) {
			for (const [method, build] of Object.entries(plugin.runtime.shapeMethods ?? {})) {
				if (used.has(method)) continue
				const shape = (...args: readonly unknown[]): object =>
					createSchema({ ...state, shapes: [...state.shapes, { method, fields: build(fieldBuilder, ...args) }] }, plugins)
				entries.push([method, shape])
			}
		}
		entries.push(['with', (rules: object): object => createSchema({ ...state, rules }, plugins)])
	}
	return Object.freeze(Object.fromEntries(entries))
}

const describeField = (descriptor: unknown): string => {
	if (!isDescriptor(descriptor)) throw new TypeError('Invalid field descriptor')
	const target = descriptor.options['target']
	if (typeof target !== 'function') return descriptor.kind
	const resolved: unknown = target()
	return `${descriptor.kind} -> ${stateOf(resolved).declaration.className}`
}

const register = (schemas: readonly unknown[], plugins: readonly PluginDefinition[]): readonly RegisteredSchema[] => {
	const ruleOwners = new Map(plugins.flatMap((plugin) => (plugin.runtime.ruleKeys ?? []).map((key) => [key, plugin.id] as const)))
	const states = schemas.map(stateOf)
	const names = new Set<string>()
	const registered = states.map((state): RegisteredSchema => {
		const { className } = state.declaration
		if (names.has(className)) throw new TypeError(`Duplicate schema '${className}'`)
		names.add(className)
		const declared = state.declaration.fields?.(fieldBuilder) ?? {}
		const pluginFields = plugins.map((plugin) => plugin.runtime.fields?.(fieldBuilder) ?? {})
		const all = Object.assign({}, ...pluginFields, ...state.shapes.map((shape) => shape.fields), declared)
		const fields = Object.fromEntries(Object.entries(all).map(([name, descriptor]) => [name, describeField(descriptor)]))
		const rules = Object.fromEntries(
			Object.entries(state.rules ?? {}).map(([key, value]) => {
				const owner = ruleOwners.get(key)
				if (owner === undefined) throw new TypeError(`${className}: no installed plugin owns the rule '${key}'`)
				return [`${owner}:${key}`, value]
			}),
		)
		return Object.freeze({ className, factory: state.declaration.factory, fields, shapeMethods: state.shapes.map((shape) => shape.method), rules })
	})
	for (const state of states) {
		for (const [name, descriptor] of Object.entries(state.declaration.fields?.(fieldBuilder) ?? {})) {
			if (!isDescriptor(descriptor) || descriptor.kind !== 'relation') continue
			const mappedBy = descriptor.options['mappedBy']
			const target = descriptor.options['target']
			if (typeof mappedBy !== 'string' || typeof target !== 'function') continue
			const targetFields = stateOf(target()).declaration.fields?.(fieldBuilder) ?? {}
			if (!(mappedBy in targetFields)) throw new TypeError(`${state.declaration.className}.${name}: mappedBy '${mappedBy}' is not a field`)
		}
	}
	for (const plugin of plugins) {
		for (const factory of plugin.runtime.requiredFactories ?? []) {
			const count = registered.filter((schema) => schema.factory === factory).length
			if (count !== 1) throw new TypeError(`Factory '${factory}' must create exactly one registered schema (found ${count})`)
		}
	}
	return registered
}

const createFactory = (plugins: readonly PluginDefinition[]): object => {
	const kit: SchemaKit = { define: (declaration) => createSchema({ declaration, shapes: [], rules: undefined }, plugins) }
	class ConfiguredApplication {
		static readonly Schema = Object.freeze({ define: (declaration: RuntimeDeclaration) => kit.define(declaration) })
		static use(...added: readonly PluginDefinition[]): object {
			return createFactory([...plugins, ...added])
		}
		readonly schemas: readonly unknown[]
		readonly #registered: readonly RegisteredSchema[]
		constructor(options: { readonly schemas: readonly unknown[] }) {
			this.schemas = Object.freeze([...options.schemas])
			this.#registered = register(this.schemas, plugins)
		}
		describe(): readonly RegisteredSchema[] {
			return this.#registered
		}
		rulesOf(pluginId: string): ReadonlyMap<string, unknown> {
			return new Map(
				this.#registered.flatMap((schema) =>
					Object.entries(schema.rules)
						.filter(([key]) => key.startsWith(`${pluginId}:`))
						.map(([, value]) => [schema.className, value] as const),
				),
			)
		}
		async start(): Promise<void> {}
	}
	for (const plugin of plugins) {
		for (const [name, build] of Object.entries(plugin.runtime.factories ?? {})) {
			Object.defineProperty(ConfiguredApplication, name, { value: Object.freeze(build(kit)), enumerable: true })
		}
	}
	return ConfiguredApplication
}

/**
 * Root factory. The runtime object is built generically from plugin runtimes; its static type
 * is computed from the plugins' type slots, which runtime code cannot express: one cast here.
 */
export const UltimaBase = createFactory([]) as Factory<AppTypes<readonly [], Readonly<Record<never, never>>, Readonly<Record<never, never>>>, readonly [], never>
