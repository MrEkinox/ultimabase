// Section 10, variant F ("plugin methods"): Core model where each installed plugin
// contributes chained methods on the defined schema (`.softDelete()`, `.access({...})`).
// Core never names a plugin: a plugin declares its methods through a generic
// higher-kinded slot (`SchemaMethodsHKT`), and Core builds the chain from the tuple of
// installed slots. Short callback hovers come from the application registry (section 9).

import type {
	CreateInput,
	FieldsOf,
	FindManyArgs,
	PointerField,
	RelationField,
	ResolveTarget,
	Result,
	ScalarField,
	SchemaRef,
	SystemFields,
} from './types.ts'

// ---------------------------------------------------------------- field builder

/** Options shared by scalar fields. */
export interface ScalarOptions<TRequired extends boolean, TValue> {
	/** Requires a non-null value on creation. @example `required: true` */
	readonly required?: TRequired
	/** Value used when creation omits the field. */
	readonly default?: TValue
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
	/** Pointer field of the target that owns this inverse relation. */
	readonly mappedBy?: TMappedBy
}

/** Field factory passed to `fields: (field) => ({ ... })`. */
export interface FieldBuilder {
	string<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, string>): ScalarField<'string', string, TRequired>
	int<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, number>): ScalarField<'int', number, TRequired>
	boolean<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, boolean>): ScalarField<'boolean', boolean, TRequired>
	date<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, Date>): ScalarField<'date', Date, TRequired>
	enum<const TValues extends readonly string[], const TRequired extends boolean = false>(
		options: ScalarOptions<TRequired, TValues[number]> & { readonly values: TValues },
	): ScalarField<'enum', TValues[number], TRequired>
	pointer<const TTarget extends SchemaTarget, const TRequired extends boolean = false>(
		options: PointerOptions<TTarget, TRequired>,
	): PointerField<TTarget, TRequired>
	relation<const TTarget extends SchemaTarget, const TMappedBy extends string | undefined = undefined>(
		options: RelationOptions<TTarget, TMappedBy>,
	): RelationField<TTarget, TMappedBy>
}

// ---------------------------------------------------------------- plugin method contributions

/**
 * Higher-kinded slot for chained schema methods. A plugin writes
 * `interface X extends SchemaMethodsHKT { readonly methods: { access: SchemaMethod<[options: AccessOptions<this['schema']>]> } }`;
 * Core substitutes a short reference to the schema for `this['schema']`.
 */
export interface SchemaMethodsHKT {
	readonly schema: unknown
	readonly methods: object
}

/**
 * One chained method: its parameters and the fields it adds to the schema type.
 * A method that adds fields is a shape method; it must be called before any other.
 */
export interface SchemaMethod<TArgs extends readonly unknown[] = readonly [], TFields extends object = Readonly<Record<never, never>>> {
	readonly '~args': TArgs
	readonly '~fields': TFields
}

/**
 * Higher-kinded slot for schema factories on the application (`App.RoleSchema`). A plugin
 * writes `interface X extends SchemaFactoriesHKT { readonly factories: MyFactories<this['app']> }`;
 * Core substitutes the application's final type configuration for `this['app']`.
 */
export interface SchemaFactoriesHKT {
	readonly app: AppTypes
	readonly factories: object
}

/** Plugin with no schema factory. */
export interface NoSchemaFactories extends SchemaFactoriesHKT {
	readonly factories: Readonly<Record<never, never>>
}

/** Static type contribution of one installed plugin. */
export interface PluginDefinition<
	TId extends string = string,
	TMethods extends SchemaMethodsHKT = SchemaMethodsHKT,
	TFields extends object = object,
	TFactories extends SchemaFactoriesHKT = NoSchemaFactories,
> {
	readonly id: TId
	readonly '~schemaMethods'?: TMethods
	readonly '~fields'?: TFields
	readonly '~schemaFactories'?: TFactories
}

/** Plugin with no schema method. */
export interface NoSchemaMethods extends SchemaMethodsHKT {
	readonly methods: Readonly<Record<never, never>>
}

/**
 * The schema reference is wrapped in an object literal type so that `SchemaRef<TSelf>`
 * is evaluated only when a method parameter reads `this['schema']`, never while the
 * chain's keys or return types are computed (that would read the registry while the
 * schema constant is being typed: TS7022, micro/e10).
 */
type ApplyMethods<THKT, TSelf> = THKT extends SchemaMethodsHKT ? (THKT & { readonly schema: SchemaRef<TSelf> })['methods'] : unknown

/** Methods of every installed slot (tuple: see lib/core.ts on TS2589). */
export type SchemaMethodsFor<THKTs, TSelf> = THKTs extends readonly [infer THead, ...infer TRest]
	? ApplyMethods<THead, TSelf> & SchemaMethodsFor<TRest, TSelf>
	: unknown

/** Schema-independent view of the methods: names and added fields only. */
type MethodShapes<THKTs> = SchemaMethodsFor<THKTs, never>

type AddedFields<TMethod> = TMethod extends SchemaMethod<readonly unknown[], infer TFields> ? TFields : never
type MethodArgs<TMethod> = TMethod extends SchemaMethod<infer TArgs, object> ? TArgs : never

type ShapeMethodNames<THKTs> = {
	[K in keyof MethodShapes<THKTs>]: keyof AddedFields<MethodShapes<THKTs>[K]> extends never ? never : K
}[keyof MethodShapes<THKTs>]

/** Chain state: methods already called, and whether shape methods are still allowed. */
export interface ChainState<TUsed extends PropertyKey = PropertyKey, TShapeOpen extends boolean = boolean> {
	readonly used: TUsed
	readonly shapeOpen: TShapeOpen
}

type AvailableMethods<THKTs, TState extends ChainState> = Exclude<
	keyof MethodShapes<THKTs>,
	TState['used'] | (TState['shapeOpen'] extends true ? never : ShapeMethodNames<THKTs>)
>

type NextState<THKTs, TState extends ChainState, K> = ChainState<
	TState['used'] | (K & PropertyKey),
	TState['shapeOpen'] extends true ? (K extends ShapeMethodNames<THKTs> ? true : false) : false
>

/** Type-level configuration of one factory. */
export interface AppTypes<THKTs = unknown, TAdded = unknown> {
	readonly '~hkts': THKTs
	readonly '~added': TAdded
}

/** Complete field map: declared fields, Core system fields and plugin fields. */
export type CompleteFields<TDeclared, TAdded> = Readonly<TDeclared & SystemFields & TAdded>

// ---------------------------------------------------------------- schema

/** Static query surface; `this` is the schema itself. */
export interface SchemaQueries {
	findMany<TSelf, const TArgs extends FindManyArgs<TSelf> = Readonly<Record<never, never>>>(
		this: TSelf,
		args?: TArgs,
	): Promise<Simplify<Result<TSelf, TArgs>>[]>
	createOne<TSelf, const TArgs extends CreateArgs<TSelf>>(this: TSelf, args: TArgs): Promise<Simplify<Result<TSelf, TArgs>>>
}

/** Prints the resolved object in editors instead of the alias. */
export type Simplify<TValue> = { [K in keyof TValue]: TValue[K] } & {}

/** Arguments of `createOne`. */
export interface CreateArgs<TSchema> extends Omit<FindManyArgs<TSchema>, 'where' | 'orderBy' | 'limit' | 'offset'> {
	readonly data: CreateInput<TSchema>
}

/**
 * One defined schema, independent of the chain state: every behaviour method of one
 * chain sees the same schema type, so filter, item and input types are computed once
 * per schema instead of once per chained call (measured in scratch/ftoggle.py).
 */
export interface DefinedSchema<TName extends string, TFields, TApp extends AppTypes> extends SchemaQueries {
	readonly className: TName
	readonly '~fields': CompleteFields<TFields, TApp['~added']>
}

/** Declared fields after one method: unchanged (same type identity) unless it adds fields. */
type FieldsAfter<TFields, TAdded> = keyof TAdded extends never ? TFields : TFields & TAdded

/**
 * Chained plugin methods. Each one is a single non-generic signature: TypeScript types
 * `const Todo = ...chain` from the return types alone and checks callbacks afterwards,
 * when every schema is resolved (same mechanism as D's `.with`).
 */
export type SchemaChain<TName extends string, TFields, TApp extends AppTypes, TState extends ChainState, TModel = unknown> = {
	readonly [K in AvailableMethods<TApp['~hkts'], TState> & string]: (
		...args: MethodArgs<SchemaMethodsFor<TApp['~hkts'], DefinedSchema<TName, TFields, TApp>>[K]>
	) => Schema<TName, FieldsAfter<TFields, AddedFields<MethodShapes<TApp['~hkts']>[K]>>, TApp, NextState<TApp['~hkts'], TState, K>, TModel>
}

/** Value returned by `App.Schema.define(...)` and by every chained method. */
export type Schema<TName extends string, TFields, TApp extends AppTypes, TState extends ChainState, TModel = unknown> = DefinedSchema<
	TName,
	TFields,
	TApp
> &
	SchemaChain<TName, TFields, TApp, TState, TModel> &
	TModel

/**
 * Schema created by a plugin factory: plugin-owned fields and model methods, a factory
 * brand checked at registration, then the ordinary chained plugin methods.
 */
export type FactorySchema<TFactory extends string, TName extends string, TFields, TApp extends AppTypes, TModel = unknown> =
	// Normalizes `AppTypes & AppTypes<H, A>` (from the HKT substitution) so hovers print one AppTypes.
	TApp extends { readonly '~hkts': infer THKTs; readonly '~added': infer TAdded }
		? Schema<TName, TFields, AppTypes<THKTs, TAdded>, ChainState<never, true>, TModel & { readonly '~factory': TFactory }>
		: never

/** Declaration of one schema. */
export interface SchemaDeclaration<TName extends string, TFields> {
	/** Runtime class name. */
	readonly className: TName
	/** Field declarations; relation targets are thunks (`() => User`). */
	readonly fields: (field: FieldBuilder) => TFields
}

/** Schema namespace of one configured factory. */
export interface SchemaNamespace<THKTs, TAdded> {
	/** Declares fields; installed plugins then contribute chained methods. */
	define<const TName extends string, const TFields>(
		declaration: SchemaDeclaration<TName, TFields>,
	): Schema<TName, TFields, AppTypes<THKTs, TAdded>, ChainState<never, true>>
}

// ---------------------------------------------------------------- registration

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

/**
 * One plugin factory may create exactly one registered schema (one Role schema, one User
 * schema). Only schemas carrying a factory brand are compared, against the tuple's union:
 * a pairwise mapped type over the tuple made registration quadratic (1.0M instantiations at 200).
 */
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

/** One application instance. */
export interface Application<TSchemas extends readonly unknown[]> {
	readonly schemas: TSchemas
	start(): Promise<void>
}

type PluginMethodsHKT<TPlugin> = TPlugin extends PluginDefinition<string, infer THKT, object, SchemaFactoriesHKT> ? THKT : NoSchemaMethods
type PluginFields<TPlugin> = TPlugin extends PluginDefinition<string, SchemaMethodsHKT, infer TFields, SchemaFactoriesHKT> ? TFields : object
type PluginFactoriesHKT<TPlugin> = TPlugin extends PluginDefinition<string, SchemaMethodsHKT, object, infer THKT> ? THKT : NoSchemaFactories

type ApplyFactories<THKT, TApp> = THKT extends SchemaFactoriesHKT ? (THKT & { readonly app: TApp })['factories'] : unknown

/** Factories of every installed slot, evaluated against the final application configuration. */
export type SchemaFactoriesFor<TFactoryHKTs, TApp> = TFactoryHKTs extends readonly [infer THead, ...infer TRest]
	? ApplyFactories<THead, TApp> & SchemaFactoriesFor<TRest, TApp>
	: unknown

/** Immutable configured factory returned by `UltimaBase.use(...)`. */
export interface ConfiguredFactory<THKTs extends readonly unknown[], TAdded, TFactoryHKTs extends readonly unknown[]> {
	use<const TPlugin extends PluginDefinition>(
		plugin: TPlugin,
	): Factory<readonly [...THKTs, PluginMethodsHKT<TPlugin>], TAdded & PluginFields<TPlugin>, readonly [...TFactoryHKTs, PluginFactoriesHKT<TPlugin>]>
	readonly Schema: SchemaNamespace<THKTs, TAdded>
	new <const TSchemas extends readonly unknown[]>(options: { readonly schemas: TSchemas & CheckedSchemas<TSchemas> }): Application<TSchemas>
}

/** Configured factory plus the schema factories contributed by installed plugins (`App.RoleSchema`). */
export type Factory<THKTs extends readonly unknown[], TAdded, TFactoryHKTs extends readonly unknown[]> = ConfiguredFactory<THKTs, TAdded, TFactoryHKTs> &
	SchemaFactoriesFor<TFactoryHKTs, AppTypes<THKTs, TAdded>>

export declare const UltimaBase: Factory<readonly [], Readonly<Record<never, never>>, readonly []>
