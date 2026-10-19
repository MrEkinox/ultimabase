// Form G (redesigned classes): `class Todo extends App.Schema('Todo', { fields }, { shape }) {
// static access = this.rules.access({ ... }) }`. The header (generic call) carries data only:
// class name, fields as an object, shape options contributed by plugins. The body carries
// rules: static members whose values are inert declarations returned by non-generic rule
// methods, typed against the header. Registration reads the static members.
// Core never names a plugin: rules, shape options, fields and factories come from generic
// higher-kinded slots. A minimal runtime is included to prove the form runs (runtime-check.mjs).

import type {
	CreateInput,
	FieldsOf,
	FindManyArgs,
	InstanceOf,
	ModelValues,
	PointerField,
	RelationField,
	ResolveTarget,
	Result,
	ScalarField,
	SchemaRef,
	SystemFields,
} from './types.ts'

/** Empty object type. */
export type Empty = Readonly<Record<never, never>>

// ---------------------------------------------------------------- field builder

/** Options shared by scalar fields. */
export interface ScalarOptions<TRequired extends boolean, TValue> {
	/** Requires a non-null value on creation. @example `required: true` */
	readonly required?: TRequired
	/** Value used when creation omits the field. */
	readonly default?: TValue
	readonly description?: string
}

/** Options of one string field, with declarative validation. */
export interface StringOptions<TRequired extends boolean> extends ScalarOptions<TRequired, string> {
	readonly minLength?: number
	readonly maxLength?: number
}

/** Options of one enum field; `list: true` stores several values. */
export interface EnumOptions<TRequired extends boolean, TList extends boolean, TValue> extends ScalarOptions<TRequired, TList extends true ? readonly TValue[] : TValue> {
	readonly list?: TList
}

/** Shared enum declared once and reused by several fields. */
export interface EnumDefinition<TName extends string, TValues extends readonly string[]> {
	readonly enumName: TName
	readonly values: TValues
}

/**
 * Relationship target: a thunk (`() => User`), kept unevaluated. `object` on purpose: a
 * function constraint makes TypeScript resolve the target while inferring (lib/core.ts).
 */
export type SchemaTarget = object

/** Options of one pointer field. */
export interface PointerOptions<TRequired extends boolean> {
	readonly required?: TRequired
	readonly onDelete?: 'restrict' | 'cascade' | 'setNull'
	readonly description?: string
}

/** Options of one relation field. */
export interface RelationOptions<TMappedBy extends string | undefined> {
	/** Pointer field of the target that owns this inverse relation. @example `mappedBy: 'assignee'` */
	readonly mappedBy?: TMappedBy
	readonly description?: string
}

/** Field factory: `export const { field } = App`, then `title: field.string({ required: true })`. */
export interface FieldBuilder {
	string<const TRequired extends boolean = false>(options?: StringOptions<TRequired>): ScalarField<'string', string, TRequired>
	int<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, number>): ScalarField<'int', number, TRequired>
	boolean<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, boolean>): ScalarField<'boolean', boolean, TRequired>
	date<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, Date>): ScalarField<'date', Date, TRequired>
	/** Inline values (`['open', 'done']`) or a shared `defineEnum(...)`. */
	enum<const TValues extends readonly string[], const TRequired extends boolean = false, const TList extends boolean = false>(
		values: TValues | EnumDefinition<string, TValues>,
		options?: EnumOptions<TRequired, TList, TValues[number]>,
	): ScalarField<'enum', TList extends true ? readonly TValues[number][] : TValues[number], TRequired>
	/** Pointer to another schema. @example `assignee: field.pointer(() => User, { onDelete: 'setNull' })` */
	pointer<const TTarget extends SchemaTarget, const TRequired extends boolean = false>(
		target: TTarget,
		options?: PointerOptions<TRequired>,
	): PointerField<TTarget, TRequired>
	/** Inverse or many-to-many relation. @example `todos: field.relation(() => Todo, { mappedBy: 'assignee' })` */
	relation<const TTarget extends SchemaTarget, const TMappedBy extends string | undefined = undefined>(
		target: TTarget,
		options?: RelationOptions<TMappedBy>,
	): RelationField<TTarget, TMappedBy>
}

// ---------------------------------------------------------------- plugin slots

/**
 * Rule slot. A plugin writes `interface X extends RulesHKT { readonly rules: XRuleOptions<this['schema']> }`
 * where `XRuleOptions<TSchema>` maps each rule name to its options type
 * (`{ readonly access: AccessOptions<TSchema> }`). Core turns each entry into a
 * non-generic method returning a schema-independent declaration: TypeScript then types
 * `static access = this.rules.access({...})` without reading the callbacks, which are
 * checked once every schema is resolved (no cycle).
 */
export interface RulesHKT {
	readonly schema: unknown
	readonly rules: object
}

/** Inert rule declaration stored in a static member and read at registration. */
export interface RuleDeclaration<TRule extends string = string> {
	readonly '~rule': TRule
	readonly options: unknown
}

/**
 * Shape slot (header options that may add fields). `this['fields']` is the declared
 * field map (to type keys), `this['input']` the options actually passed.
 */
export interface ShapeOptionsHKT {
	readonly fields: unknown
	readonly input: unknown
	readonly options: object
	readonly added: object
}

/** Factory slot (`App.RoleSchema`); `required` names factories that need exactly one schema. */
export interface SchemaFactoriesHKT {
	readonly app: AppTypes
	readonly factories: object
	readonly required: string
}

export interface NoRules extends RulesHKT {
	readonly rules: Empty
}
export interface NoShape extends ShapeOptionsHKT {
	readonly options: Empty
	readonly added: Empty
}
export interface NoFactories extends SchemaFactoriesHKT {
	readonly factories: Empty
	readonly required: never
}

/** Runtime part of a plugin (type-level slots are phantom). */
export interface PluginRuntime {
	readonly rules?: readonly string[]
	readonly shapeOptions?: readonly string[]
	readonly shapeFields?: (shape: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>
	readonly fields?: Readonly<Record<string, unknown>>
	readonly factories?: Readonly<Record<string, (kit: FactoryKit) => (...args: never[]) => unknown>>
	readonly requiredFactories?: readonly string[]
}

/** Static type contribution and runtime part of one installed plugin. */
export interface PluginDefinition<
	TId extends string = string,
	TRules extends RulesHKT = NoRules,
	TFields extends object = Empty,
	TShape extends ShapeOptionsHKT = NoShape,
	TFactories extends SchemaFactoriesHKT = NoFactories,
> {
	readonly id: TId
	readonly runtime: PluginRuntime
	readonly '~rules'?: TRules
	readonly '~fields'?: TFields
	readonly '~shape'?: TShape
	readonly '~factories'?: TFactories
}

/** Type-level configuration of one configured factory. */
export interface AppTypes<TRules = unknown, TShapes = unknown, TAdded = unknown> {
	readonly '~rules': TRules
	readonly '~shapes': TShapes
	readonly '~added': TAdded
}

/**
 * The schema is wrapped in an object type so `SchemaRef` (which reads the registry) is
 * evaluated only when a rule parameter reads `this['schema']`, never while a class's
 * static members are typed (lib-f/core.ts, micro/e10).
 */
type ApplyRules<THKT, TSchema> = THKT extends RulesHKT ? (THKT & { readonly schema: SchemaRef<TSchema> })['rules'] : unknown

/** Rule options of every installed slot (tuple: intersecting HKTs directly hits TS2589). */
export type RulesFor<THKTs, TSchema> = THKTs extends readonly [infer THead, ...infer TRest] ? ApplyRules<THead, TSchema> & RulesFor<TRest, TSchema> : unknown

/** Schema-independent view of the rules: names and documentation only. */
type RuleShapes<THKTs> = RulesFor<THKTs, never>

/**
 * Rule entry points (`this.rules.access(...)`). Keys come from the schema-independent
 * view; the schema is read only by each method's parameter, which TypeScript resolves
 * when it checks the call's arguments, never while it types the static member (reading
 * it earlier evaluates the application registry during class typing: TS2502/TS2456).
 */
export type RuleMethods<THKTs, TSchema> = {
	readonly [K in keyof RuleShapes<THKTs>]: (
		options: K extends keyof RulesFor<THKTs, TSchema> ? RulesFor<THKTs, TSchema>[K] : never,
	) => RuleDeclaration<K & string>
}

type ApplyShape<THKT, TFields, TInput> = THKT extends ShapeOptionsHKT ? THKT & { readonly fields: TFields; readonly input: TInput } : never

/** Shape options accepted by the installed plugins for one declared field map. */
export type ShapeOptionsFor<THKTs, TFields> = THKTs extends readonly [infer THead, ...infer TRest]
	? ApplyShape<THead, TFields, unknown>['options'] & ShapeOptionsFor<TRest, TFields>
	: unknown

/** Fields added by the shape options actually passed. */
export type ShapeFieldsFor<THKTs, TInput> = THKTs extends readonly [infer THead, ...infer TRest]
	? ApplyShape<THead, unknown, TInput>['added'] & ShapeFieldsFor<TRest, TInput>
	: unknown

/** Error carried by an unknown shape option key. */
export interface UnknownSchemaOption<TKey extends string> {
	readonly '~error': `'${TKey}' is not a schema option of the installed plugins`
}

/**
 * Rejects unknown shape option keys (inferred arguments get no excess-property check).
 * The error is an object type: a string literal would intersect the value to `never`
 * and collapse the whole parameter to `undefined`.
 */
export type ExactShape<TShape, TAllowed> = {
	readonly [K in Exclude<keyof TShape, keyof TAllowed>]: UnknownSchemaOption<K & string>
}

/** Complete field map: declared fields, Core system fields and plugin fields. */
export type CompleteFields<TDeclared, TAdded> = Readonly<TDeclared & SystemFields & TAdded>

// ---------------------------------------------------------------- schema base class

/** Prints the resolved object in editors instead of the alias. */
export type Simplify<TValue> = { [K in keyof TValue]: TValue[K] } & {}

type QueryResult<TSelf, TArgs> = TArgs extends { readonly select: object } | { readonly include: object } ? Simplify<Result<TSelf, TArgs>> : InstanceOf<TSelf>

/** Arguments of `createOne`. */
export interface CreateArgs<TSchema> extends Omit<FindManyArgs<TSchema>, 'where' | 'orderBy' | 'limit' | 'offset'> {
	readonly data: CreateInput<TSchema>
}

/** Static query surface; `this` is the schema class, so results without projection are its instances. */
export interface SchemaQueries {
	findMany<TSelf, const TArgs extends FindManyArgs<TSelf> = Empty>(this: TSelf, args?: TArgs): Promise<QueryResult<TSelf, TArgs>[]>
	findOne<TSelf, const TArgs extends FindManyArgs<TSelf> = Empty>(this: TSelf, args?: TArgs): Promise<QueryResult<TSelf, TArgs> | null>
	createOne<TSelf, const TArgs extends CreateArgs<TSelf>>(this: TSelf, args: TArgs): Promise<QueryResult<TSelf, TArgs>>
}

/** Schema seen by rules: the class name and the complete fields of the header. */
export interface SchemaHeader<TName extends string, TFields> {
	readonly className: TName
	readonly '~fields': TFields
}

/** Base class returned by `App.Schema(...)`. */
export interface SchemaStatics<TName extends string, TFields, TRules> extends SchemaQueries {
	new (): ModelValues<TFields>
	readonly className: TName
	readonly '~fields': TFields
	/**
	 * Rules of the installed plugins, typed against this schema. Assign each one to the
	 * static member of the same name.
	 * @example `static access = this.rules.access({ read: true })`
	 */
	readonly rules: TRules
}

/** Base class of one schema for one application configuration. */
export type SchemaBase<TName extends string, TFields, TApp extends AppTypes, TStatics = unknown> = SchemaStatics<
	TName,
	TFields,
	RuleMethods<TApp['~rules'], SchemaHeader<TName, TFields>>
> &
	TStatics

/** `App.Schema(className, fields, shape?)`. */
export interface SchemaFunction<TApp extends AppTypes> {
	<const TName extends string, const TFields, const TShape extends ShapeOptionsFor<TApp['~shapes'], TFields>>(
		className: TName,
		fields: TFields,
		shape?: TShape & ExactShape<TShape, ShapeOptionsFor<TApp['~shapes'], TFields>>,
	): SchemaBase<TName, CompleteFields<TFields, ShapeFieldsFor<TApp['~shapes'], TShape> & TApp['~added']>, TApp>
}

/** Brand of a schema created by a plugin factory, with the static members the factory adds. */
export interface FactoryBrand<TFactory extends string, TStaticKeys> {
	readonly '~factory': TFactory
	readonly '~statics': TStaticKeys
}

/** Base class created by a plugin factory (`App.RoleSchema(...)`): owned fields and statics. */
export type FactorySchemaBase<TFactory extends string, TName extends string, TDeclared, TShape, TApp extends AppTypes, TStatics> =
	// Normalizes `AppTypes & AppTypes<...>` produced by the HKT substitution.
	TApp extends { readonly '~rules': infer TRules; readonly '~shapes': infer TShapes; readonly '~added': infer TAdded }
		? SchemaBase<
				TName,
				CompleteFields<TDeclared, ShapeFieldsFor<TShapes, TShape> & TAdded>,
				AppTypes<TRules, TShapes, TAdded>,
				TStatics & FactoryBrand<TFactory, keyof TStatics>
			>
		: never

// ---------------------------------------------------------------- registration checks

type NameOf<TSchema> = TSchema extends { readonly className: infer TName extends string } ? TName : never

type RelationIssues<TSchema> = {
	[K in keyof FieldsOf<TSchema>]: FieldsOf<TSchema>[K] extends RelationField<infer TTarget, infer TMappedBy>
		? TMappedBy extends string
			? TMappedBy extends keyof FieldsOf<ResolveTarget<TTarget>>
				? never
				: `${NameOf<TSchema>}.${K & string}: mappedBy '${TMappedBy}' is not a field of ${NameOf<ResolveTarget<TTarget>>}`
			: never
		: FieldsOf<TSchema>[K] extends PointerField<infer TTarget>
			? [ResolveTarget<TTarget>] extends [never]
				? `${NameOf<TSchema>}.${K & string}: the target must be a thunk such as () => User`
				: never
			: never
}[keyof FieldsOf<TSchema>]

type FactoryOf<TSchema> = TSchema extends { readonly '~factory': infer TFactory extends string } ? TFactory : never

type FactoryIssues<TSchemas extends readonly unknown[], TSchema> = TSchema extends { readonly '~factory': infer TFactory extends string }
	? [Exclude<Extract<TSchemas[number], { readonly '~factory': TFactory }>, TSchema>] extends [never]
		? never
		: `${NameOf<TSchema>}: App.${TFactory} may create exactly one registered schema`
	: never

/** Static members every base class has; anything else in a class body must be a rule. */
type BaseStaticKeys = 'prototype' | 'className' | '~fields' | 'rules' | 'findMany' | 'findOne' | 'createOne' | '~factory' | '~statics'
type FactoryStaticKeys<TSchema> = TSchema extends { readonly '~statics': infer TKeys } ? TKeys : never
type RuleNames<TRules> = keyof RuleShapes<TRules> & string
type OwnStaticKeys<TSchema> = Exclude<keyof TSchema, BaseStaticKeys | FactoryStaticKeys<TSchema>>

type StaticIssues<TSchema, TRules> = {
	[K in OwnStaticKeys<TSchema>]: K extends RuleNames<TRules>
		? TSchema[K] extends RuleDeclaration<K>
			? never
			: `${NameOf<TSchema>}.${K}: assign this.rules.${K}(...) to this static member`
		: `${NameOf<TSchema>}.${K & string}: static member is not a rule of an installed plugin`
}[OwnStaticKeys<TSchema>]

type InstanceIssues<TSchema> = {
	[K in Exclude<keyof InstanceOf<TSchema>, keyof ModelValues<FieldsOf<TSchema>>>]: `${NameOf<TSchema>}: instance member '${K & string}' is not allowed (models are immutable data)`
}[Exclude<keyof InstanceOf<TSchema>, keyof ModelValues<FieldsOf<TSchema>>>]

type Issues<TSchemas extends readonly unknown[], TSchema, TRules> =
	| RelationIssues<TSchema>
	| FactoryIssues<TSchemas, TSchema>
	| StaticIssues<TSchema, TRules>
	| InstanceIssues<TSchema>

/** Registration error shown in place of one invalid schema. */
export interface SchemaRegistrationError<TMessage extends string> {
	readonly '~error': TMessage
}

/** Each registered schema, or a readable error instead of it. */
export type CheckedSchemas<TSchemas extends readonly unknown[], TRules> = {
	readonly [K in keyof TSchemas]: [Issues<TSchemas, TSchemas[K], TRules>] extends [never]
		? TSchemas[K]
		: SchemaRegistrationError<Issues<TSchemas, TSchemas[K], TRules> & string>
}

type RequiredFactories<TFactoryHKTs> = TFactoryHKTs extends readonly [infer THead, ...infer TRest]
	? (THead extends SchemaFactoriesHKT ? THead['required'] : never) | RequiredFactories<TRest>
	: never

type MissingFactories<TSchemas extends readonly unknown[], TFactoryHKTs> = Exclude<RequiredFactories<TFactoryHKTs>, FactoryOf<TSchemas[number]>>

/** Registration options; a required factory without its schema is reported here. */
export type ApplicationOptions<TSchemas extends readonly unknown[], TRules, TFactoryHKTs> = {
	readonly schemas: TSchemas & CheckedSchemas<TSchemas, TRules>
} & ([MissingFactories<TSchemas, TFactoryHKTs>] extends [never]
	? unknown
	: { readonly '~missingSchema': `register exactly one schema created with App.${MissingFactories<TSchemas, TFactoryHKTs>}` })

/** What registration collected for one schema (runtime). */
export interface RegisteredSchema {
	readonly className: string
	readonly factory: string | undefined
	readonly fields: readonly string[]
	readonly shape: Readonly<Record<string, unknown>>
	readonly rules: Readonly<Record<string, unknown>>
}

/** One application instance. */
export interface Application<TSchemas extends readonly unknown[]> {
	readonly schemas: TSchemas
	readonly registry: readonly RegisteredSchema[]
	start(): Promise<void>
}

// ---------------------------------------------------------------- configured factory

/** Constraint of an installed plugin (every slot at its widest). */
export type AnyPlugin = PluginDefinition<string, RulesHKT, object, ShapeOptionsHKT, SchemaFactoriesHKT>

type PluginRules<TPlugin> = TPlugin extends PluginDefinition<string, infer THKT, object, ShapeOptionsHKT, SchemaFactoriesHKT> ? THKT : NoRules
type PluginShape<TPlugin> = TPlugin extends PluginDefinition<string, RulesHKT, object, infer THKT, SchemaFactoriesHKT> ? THKT : NoShape
type PluginFactories<TPlugin> = TPlugin extends PluginDefinition<string, RulesHKT, object, ShapeOptionsHKT, infer THKT> ? THKT : NoFactories
type PluginFields<TPlugins> = TPlugins extends readonly [infer THead, ...infer TRest]
	? (THead extends PluginDefinition<string, RulesHKT, infer TFields, ShapeOptionsHKT, SchemaFactoriesHKT> ? TFields : Empty) & PluginFields<TRest>
	: unknown

type MapRules<TPlugins extends readonly unknown[]> = { readonly [K in keyof TPlugins]: PluginRules<TPlugins[K]> }
type MapShapes<TPlugins extends readonly unknown[]> = { readonly [K in keyof TPlugins]: PluginShape<TPlugins[K]> }
type MapFactories<TPlugins extends readonly unknown[]> = { readonly [K in keyof TPlugins]: PluginFactories<TPlugins[K]> }

type ApplyFactories<THKT, TApp> = THKT extends SchemaFactoriesHKT ? (THKT & { readonly app: TApp })['factories'] : unknown

/** Factories of every installed slot, evaluated against the final configuration. */
export type SchemaFactoriesFor<TFactoryHKTs, TApp> = TFactoryHKTs extends readonly [infer THead, ...infer TRest]
	? ApplyFactories<THead, TApp> & SchemaFactoriesFor<TRest, TApp>
	: unknown

/** Immutable configured factory returned by `UltimaBase.use(...)`. */
export interface ConfiguredFactory<TRules extends readonly unknown[], TShapes extends readonly unknown[], TAdded, TFactories extends readonly unknown[]> {
	/** Installs plugins; returns a new configured factory. */
	use<const TPlugins extends readonly AnyPlugin[]>(
		...plugins: TPlugins
	): Factory<
		readonly [...TRules, ...MapRules<TPlugins>],
		readonly [...TShapes, ...MapShapes<TPlugins>],
		TAdded & PluginFields<TPlugins>,
		readonly [...TFactories, ...MapFactories<TPlugins>]
	>
	/** Field builder: `export const { field } = App`. */
	readonly field: FieldBuilder
	/** Base class of one schema: `class Todo extends App.Schema('Todo', { ... }, { softDelete: true }) {}`. */
	readonly Schema: SchemaFunction<AppTypes<TRules, TShapes, TAdded>>
	new <const TSchemas extends readonly unknown[]>(options: ApplicationOptions<TSchemas, TRules, TFactories>): Application<TSchemas>
}

/** Configured factory plus the schema factories of installed plugins (`App.RoleSchema`). */
export type Factory<TRules extends readonly unknown[], TShapes extends readonly unknown[], TAdded, TFactories extends readonly unknown[]> = ConfiguredFactory<
	TRules,
	TShapes,
	TAdded,
	TFactories
> &
	SchemaFactoriesFor<TFactories, AppTypes<TRules, TShapes, TAdded>>

// ---------------------------------------------------------------- runtime (model only)

/** Runtime field descriptor; the type-level phantoms do not exist at runtime. */
interface RuntimeField {
	readonly kind: string
	readonly target?: unknown
	readonly values?: readonly string[]
	readonly options?: unknown
}

/** Helpers given to plugin factories to build a schema base class. */
export interface FactoryKit {
	readonly field: FieldBuilder
	createBase(
		className: string,
		fields: Readonly<Record<string, unknown>>,
		shape: Readonly<Record<string, unknown>>,
		factory?: { readonly id: string; readonly statics: Readonly<Record<string, unknown>> },
		owned?: Readonly<Record<string, unknown>>,
	): unknown
}

/** Merges field maps keeping getters unevaluated (`Object.getOwnPropertyDescriptors`). */
export const mergeFields = (...maps: readonly Readonly<Record<string, unknown>>[]): Readonly<Record<string, unknown>> =>
	Object.defineProperties({}, Object.assign({}, ...maps.map((map) => Object.getOwnPropertyDescriptors(map))))

// One cast for every descriptor: runtime descriptors carry no phantom members.
const descriptor = <TField>(field: RuntimeField): TField => Object.freeze(field) as unknown as TField

const fieldBuilder: FieldBuilder = Object.freeze({
	string: (options) => descriptor({ kind: 'string', options }),
	int: (options) => descriptor({ kind: 'int', options }),
	boolean: (options) => descriptor({ kind: 'boolean', options }),
	date: (options) => descriptor({ kind: 'date', options }),
	enum: (values, options) => descriptor({ kind: 'enum', values: 'enumName' in values ? values.values : values, options }),
	pointer: (target, options) => descriptor({ kind: 'pointer', target, options }),
	relation: (target, options) => descriptor({ kind: 'relation', target, options }),
} satisfies FieldBuilder)

/** Declares one shared enum. @example `export const Priority = defineEnum('Priority', ['low', 'high'])` */
export const defineEnum = <const TName extends string, const TValues extends readonly string[]>(enumName: TName, values: TValues): EnumDefinition<TName, TValues> =>
	Object.freeze({ enumName, values })

const systemFields: Readonly<Record<string, RuntimeField>> = Object.freeze({
	id: { kind: 'string' },
	createdAt: { kind: 'date' },
	updatedAt: { kind: 'date' },
})

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null

const isRule = (value: unknown): value is RuleDeclaration => isRecord(value) && typeof value['~rule'] === 'string'

const register = (schemas: readonly unknown[], plugins: readonly AnyPlugin[]): readonly RegisteredSchema[] => {
	const ruleNames = new Set(plugins.flatMap((plugin) => plugin.runtime.rules ?? []))
	const ignored = new Set(['length', 'name', 'prototype'])
	const factories = new Map<string, string>()
	const registry = schemas.map((schema): RegisteredSchema => {
		const header: unknown = typeof schema === 'function' ? Reflect.get(schema, '~header') : undefined
		if (typeof schema !== 'function' || !isRecord(header)) throw new TypeError('Only classes extending App.Schema(...) can be registered')
		const className = String(header['className'])
		const factory = typeof header['factory'] === 'string' ? header['factory'] : undefined
		if (factory !== undefined) {
			if (factories.has(factory)) throw new TypeError(`${className}: App.${factory} may create exactly one registered schema`)
			factories.set(factory, className)
		}
		const rules = Object.getOwnPropertyNames(schema)
			.filter((key) => !ignored.has(key))
			.map((key): readonly [string, unknown] => {
				const value: unknown = Reflect.get(schema, key)
				if (!isRule(value) || !ruleNames.has(value['~rule'])) throw new TypeError(`${className}.${key}: static member is not a rule of an installed plugin`)
				if (value['~rule'] !== key) throw new TypeError(`${className}.${key}: holds a '${value['~rule']}' rule`)
				return [key, value.options]
			})
		const prototype: unknown = Reflect.get(schema, 'prototype')
		const methods = isRecord(prototype) ? Object.getOwnPropertyNames(prototype).filter((key) => key !== 'constructor') : []
		if (methods.length > 0) throw new TypeError(`${className}: instance members are not allowed (${methods.join(', ')})`)
		const fields = isRecord(header['fields']) ? header['fields'] : {}
		const shape = isRecord(header['shape']) ? header['shape'] : {}
		return Object.freeze({ className, factory, fields: Object.keys(fields), shape, rules: Object.freeze(Object.fromEntries(rules)) })
	})
	for (const plugin of plugins) {
		for (const required of plugin.runtime.requiredFactories ?? []) {
			if (!factories.has(required)) throw new TypeError(`register exactly one schema created with App.${required}`)
		}
	}
	return Object.freeze(registry)
}

const createFactory = (plugins: readonly AnyPlugin[]): unknown => {
	const ruleNames = [...new Set(plugins.flatMap((plugin) => plugin.runtime.rules ?? []))]
	const rules = Object.freeze(Object.fromEntries(ruleNames.map((name) => [name, (options: unknown): RuleDeclaration => Object.freeze({ '~rule': name, options })])))
	const shapeKeys = new Set(plugins.flatMap((plugin) => plugin.runtime.shapeOptions ?? []))
	const kit: FactoryKit = {
		field: fieldBuilder,
		createBase: (className, declared, shape, factory, owned) => {
			for (const key of Object.keys(shape)) if (!shapeKeys.has(key)) throw new TypeError(`${className}: '${key}' is not a schema option of the installed plugins`)
			// Relation getters are copied as getters: reading them now would hit classes that
			// are not initialized yet (circular imports). Registration reads them later.
			const fields = Object.freeze(
				mergeFields(
					declared,
					owned ?? {},
					systemFields,
					...plugins.map((plugin) => plugin.runtime.fields ?? {}),
					...plugins.map((plugin) => plugin.runtime.shapeFields?.(shape) ?? {}),
				),
			)
			const header = Object.freeze({ className, fields, shape, factory: factory?.id })
			const base = class SchemaBase {
				static readonly className = className
				static readonly '~header' = header
				static readonly '~fields' = fields
				static readonly rules = rules
				static async findMany(): Promise<readonly unknown[]> {
					return []
				}
				static async findOne(): Promise<unknown> {
					return null
				}
				static async createOne(): Promise<unknown> {
					return {}
				}
			}
			for (const [key, value] of Object.entries(factory?.statics ?? {})) Object.defineProperty(base, key, { value, enumerable: false })
			return base
		},
	}
	const factories = plugins.flatMap((plugin) => Object.entries(plugin.runtime.factories ?? {}).map(([name, create]) => [name, create(kit)] as const))
	class App {
		static readonly field = fieldBuilder
		static readonly Schema = (className: string, fields: Readonly<Record<string, unknown>>, shape?: Readonly<Record<string, unknown>>): unknown =>
			kit.createBase(className, fields, shape ?? {})
		static use(...more: readonly AnyPlugin[]): unknown {
			return createFactory([...plugins, ...more])
		}
		readonly schemas: readonly unknown[]
		readonly registry: readonly RegisteredSchema[]
		constructor(options: { readonly schemas: readonly unknown[] }) {
			this.schemas = options.schemas
			this.registry = register(options.schemas, plugins)
		}
		async start(): Promise<void> {}
	}
	for (const [name, create] of factories) Object.defineProperty(App, name, { value: create, enumerable: true })
	return App
}

// The runtime factory is untyped (plugins are only known at the type level); one cast.
export const UltimaBase: Factory<readonly [], readonly [], Empty, readonly []> = createFactory([]) as Factory<readonly [], readonly [], Empty, readonly []>
