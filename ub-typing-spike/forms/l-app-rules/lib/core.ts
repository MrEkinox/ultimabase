// Form L ("rules at the application level"): Core model.
//   export const Todo = App.Schema.define({ className, softDelete: true, fields })   // data only
//   new App({ schemas: [Todo, ...], rules: { Todo: { access, hooks, ... }, TodoUser: {...} } })
// Rules are typed against the complete registered schema set: keys are class names, and
// each entry receives the rule entries of every installed plugin for that schema. Schema
// constants never depend on rules. Core never names a plugin (`SchemaRulesHKT` slots).

import { createFactory, type RuntimePlugin } from './runtime.ts'
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
	/** Returns `true`, or an error message. @example `validate: (value) => value.length <= 200 || 'too long'` */
	readonly validate?: (value: TValue) => true | string
	/** Field hooks. @example `hooks: { resolveInput: ({ value }) => value.trim() }` */
	readonly hooks?: { readonly resolveInput?: (args: { readonly value: TValue }) => TValue }
}

/** Shared enum declared once with `defineEnum('TodoPriority', [...])`. */
export interface EnumDefinition<TName extends string, TValues extends readonly string[]> {
	readonly enumName: TName
	readonly values: TValues
}

/** Declares one enum shared by several fields or schemas. @example `defineEnum('TodoPriority', ['low', 'high'])` */
export const defineEnum = <const TName extends string, const TValues extends readonly string[]>(
	enumName: TName,
	values: TValues,
): EnumDefinition<TName, TValues> => Object.freeze({ enumName, values })

type EnumValues<TValues> = TValues extends EnumDefinition<string, infer TList> ? TList[number] : TValues extends readonly string[] ? TValues[number] : never

/** Relationship target: a thunk (`() => User`), kept unevaluated (see lib/core.ts). */
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
	/** Pointer or relation field of the target that owns this inverse relation. */
	readonly mappedBy?: TMappedBy
}

/** Field factory passed to `fields: (field) => ({ ... })`. */
export interface FieldBuilder {
	string<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, string>): ScalarField<'string', string, TRequired>
	int<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, number>): ScalarField<'int', number, TRequired>
	boolean<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, boolean>): ScalarField<'boolean', boolean, TRequired>
	date<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, Date>): ScalarField<'date', Date, TRequired>
	/** Inline values (`values: ['a', 'b']`) or a shared enum (`values: TodoPriority`). */
	enum<const TValues extends readonly string[] | EnumDefinition<string, readonly string[]>, const TRequired extends boolean = false>(
		options: ScalarOptions<TRequired, EnumValues<TValues>> & { readonly values: TValues },
	): ScalarField<'enum', EnumValues<TValues>, TRequired>
	/** List of one scalar kind. @example `field.list(field.enum({ values: TodoPriority }))` */
	list<TValue, const TRequired extends boolean = false>(
		item: ScalarField<ScalarKindOf, TValue, boolean>,
		options?: ScalarOptions<TRequired, readonly TValue[]>,
	): ScalarField<'list', readonly TValue[], TRequired>
	pointer<const TTarget extends SchemaTarget, const TRequired extends boolean = false>(
		options: PointerOptions<TTarget, TRequired>,
	): PointerField<TTarget, TRequired>
	relation<const TTarget extends SchemaTarget, const TMappedBy extends string | undefined = undefined>(
		options: RelationOptions<TTarget, TMappedBy>,
	): RelationField<TTarget, TMappedBy>
}

type ScalarKindOf = 'string' | 'int' | 'boolean' | 'date' | 'enum'

// ---------------------------------------------------------------- plugin slots

/**
 * Rule entries of one plugin: `interface AccessRules extends SchemaRulesHKT {
 * readonly rules: { readonly access?: AccessOptions<this['schema']> } }`. Core substitutes
 * a short reference to the complete schema for `this['schema']`.
 */
export interface SchemaRulesHKT {
	readonly schema: unknown
	readonly rules: object
}

/**
 * Shape options of one plugin, accepted by `define` and read before the schema exists:
 * `readonly options: { readonly softDelete?: boolean }` and
 * `readonly fields: this['declaration'] extends { readonly softDelete: true } ? {...} : {}`.
 */
export interface SchemaShapeHKT {
	readonly declaration: unknown
	readonly options: object
	readonly fields: object
}

/** Schema factories of one plugin (`App.RoleSchema`); `this['app']` is the final configuration. */
export interface SchemaFactoriesHKT {
	readonly app: AppTypes
	readonly factories: object
}

/** Everything one plugin contributes to the types. */
export interface PluginTypes {
	readonly rules?: SchemaRulesHKT
	readonly shape?: SchemaShapeHKT
	/** Fields added to every schema. */
	readonly fields?: object
	readonly factories?: SchemaFactoriesHKT
}

/** One installed plugin: its runtime part and, as a phantom, its type contributions. */
export interface PluginDefinition<TId extends string = string, TTypes extends PluginTypes = PluginTypes> extends RuntimePlugin {
	readonly id: TId
	readonly '~types'?: TTypes
}

type TypesOf<TPlugin> = TPlugin extends { readonly '~types'?: infer TTypes } ? TTypes : never
type FieldsSlot<TPlugin> = TypesOf<TPlugin> extends { readonly fields: infer TFields } ? TFields : unknown

type ApplyRules<THKT, TSchema> = THKT extends SchemaRulesHKT ? (THKT & { readonly schema: TSchema })['rules'] : unknown

/** Rule entries of every installed plugin for one schema (tuple: see lib/core.ts on TS2589). */
export type SchemaRulesFor<THKTs, TSchema> = THKTs extends readonly [infer THead, ...infer TRest]
	? ApplyRules<THead, TSchema> & SchemaRulesFor<TRest, TSchema>
	: unknown

type ApplyShapeOptions<THKT> = THKT extends SchemaShapeHKT ? THKT['options'] : unknown
type ApplyShapeFields<THKT, TDeclaration> = THKT extends SchemaShapeHKT ? (THKT & { readonly declaration: TDeclaration })['fields'] : unknown

/** Shape options accepted by `define`. */
export type ShapeOptionsFor<THKTs> = THKTs extends readonly [infer THead, ...infer TRest] ? ApplyShapeOptions<THead> & ShapeOptionsFor<TRest> : unknown

/** Fields added by the shape options of one declaration. */
export type ShapeFieldsFor<THKTs, TDeclaration> = THKTs extends readonly [infer THead, ...infer TRest]
	? ApplyShapeFields<THead, TDeclaration> & ShapeFieldsFor<TRest, TDeclaration>
	: unknown

/** Type-level configuration of one factory. */
export interface AppTypes<TRules = unknown, TAdded = unknown, TShapes = unknown> {
	readonly '~rules': TRules
	readonly '~added': TAdded
	readonly '~shapes': TShapes
}

/** Complete field map: declared fields, Core system fields and plugin fields. */
export type CompleteFields<TDeclared, TAdded> = Readonly<TDeclared & SystemFields & TAdded>

// ---------------------------------------------------------------- schema

/** Prints the resolved object in editors instead of the alias. */
export type Simplify<TValue> = { [K in keyof TValue]: TValue[K] } & {}

/** Arguments of `createOne`. */
export interface CreateArgs<TSchema> extends Omit<FindManyArgs<TSchema>, 'where' | 'orderBy' | 'limit' | 'offset'> {
	readonly data: CreateInput<TSchema>
}

/** Query options shared by every operation. */
export interface OperationOptions {
	/** Bypasses authorization (never validation, hooks or transactions). Server-side only. */
	readonly useMasterKey?: boolean
}

/** Static query surface; `this` is the schema itself. */
export interface SchemaQueries {
	findMany<TSelf, const TArgs extends FindManyArgs<TSelf> = Readonly<Record<never, never>>>(
		this: TSelf,
		args?: TArgs,
		options?: OperationOptions,
	): Promise<Simplify<Result<TSelf, TArgs>>[]>
	createOne<TSelf, const TArgs extends CreateArgs<TSelf>>(this: TSelf, args: TArgs, options?: OperationOptions): Promise<Simplify<Result<TSelf, TArgs>>>
}

/** One defined schema: data only (fields and queries). */
export interface DefinedSchema<TName extends string, TFields, TApp extends AppTypes> extends SchemaQueries {
	readonly className: TName
	readonly '~fields': CompleteFields<TFields, TApp['~added']>
}

/** Schema created by a plugin factory: owned fields, model methods and a factory brand. */
export type FactorySchema<TFactory extends string, TName extends string, TFields, TApp extends AppTypes, TModel = unknown> =
	// Normalizes `AppTypes & AppTypes<...>` (from the HKT substitution) so hovers print one AppTypes.
	TApp extends { readonly '~rules': infer TRules; readonly '~added': infer TAdded; readonly '~shapes': infer TShapes }
		? DefinedSchema<TName, TFields, AppTypes<TRules, TAdded, TShapes>> & TModel & { readonly '~factory': TFactory }
		: never

/** Declaration of one schema. */
export interface SchemaDeclaration<TName extends string, TFields> {
	/** Runtime class name. */
	readonly className: TName
	/** Field declarations; relation targets are thunks (`() => User`). */
	readonly fields: (field: FieldBuilder) => TFields
}

/** Schema namespace of one configured factory. */
export interface SchemaNamespace<TApp extends AppTypes> {
	/**
	 * Declares one schema: class name, fields and the shape options of installed plugins
	 * (`softDelete: true`). Behaviour rules go to `new App({ rules: { Todo: {...} } })`.
	 */
	define<const TName extends string, const TFields, const TShape extends ShapeOptionsFor<TApp['~shapes']>>(
		declaration: SchemaDeclaration<TName, TFields> & TShape,
	): DefinedSchema<TName, FieldsWithShape<TFields, ShapeFieldsFor<TApp['~shapes'], TShape>>, TApp>
}

/** Declared fields unchanged (same identity) unless shape options add some. */
type FieldsWithShape<TFields, TAdded> = keyof TAdded extends never ? TFields : TFields & TAdded

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

/** Registration error shown in place of one invalid entry. */
export interface SchemaRegistrationError<TMessage extends string> {
	readonly '~error': TMessage
}

/** One plugin factory creates at most one registered schema (linear: compared against the union). */
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

/** Registered schemas by class name (lookup table only). */
export type SchemasByClassName<TSchemas extends readonly unknown[]> = { readonly [TSchema in TSchemas[number] as NameOf<TSchema>]: TSchema }

/**
 * Rules of every registered schema, keyed by class name. Each entry is optional and
 * typed against its own schema; unknown class names are excess properties. Mapping the
 * schema union directly with an `as` clause loses contextual typing of the callbacks
 * (TS7031 on every parameter, scratch/m.ts): keys come from the lookup table instead.
 */
export type ApplicationRules<TRules, TSchemas extends readonly unknown[]> = {
	readonly [K in keyof SchemasByClassName<TSchemas>]?: SchemaRulesFor<TRules, SchemaRef<SchemasByClassName<TSchemas>[K]>>
}

/** Registration options of one application. */
export interface ApplicationOptions<TRules, TSchemas extends readonly unknown[]> {
	/** Every schema of the application. */
	readonly schemas: TSchemas & CheckedSchemas<TSchemas>
	/** Plugin rules per schema class name. @example `rules: { Todo: { access: { read: true } } }` */
	readonly rules?: ApplicationRules<TRules, TSchemas>
}

/** One application instance. */
export interface Application<TSchemas extends readonly unknown[]> {
	readonly schemas: TSchemas
	start(): Promise<void>
}

type ApplyFactories<THKT, TApp> = THKT extends SchemaFactoriesHKT ? (THKT & { readonly app: TApp })['factories'] : unknown

/** Factories of every installed slot, evaluated against the final configuration. */
export type SchemaFactoriesFor<TFactoryHKTs, TApp> = TFactoryHKTs extends readonly [infer THead, ...infer TRest]
	? ApplyFactories<THead, TApp> & SchemaFactoriesFor<TRest, TApp>
	: unknown

type SlotsOf<TPlugins, TKind extends 'rules' | 'shape' | 'factories'> = TPlugins extends readonly [infer THead, ...infer TRest]
	? TypesOf<THead> extends { readonly [K in TKind]: infer THKT }
		? readonly [THKT, ...SlotsOf<TRest, TKind>]
		: SlotsOf<TRest, TKind>
	: readonly []

type FieldsOfPlugins<TPlugins> = TPlugins extends readonly [infer THead, ...infer TRest] ? FieldsSlot<THead> & FieldsOfPlugins<TRest> : unknown

/** Immutable configured factory returned by `UltimaBase.use(...)`. */
export interface ConfiguredFactory<TRules extends readonly unknown[], TAdded, TShapes extends readonly unknown[], TFactories extends readonly unknown[]> {
	/** Installs plugins; returns a new factory. @example `UltimaBase.use(accessPlugin(), hooksPlugin())` */
	use<const TPlugins extends readonly PluginDefinition[]>(
		...plugins: TPlugins
	): Factory<
		readonly [...TRules, ...SlotsOf<TPlugins, 'rules'>],
		TAdded & FieldsOfPlugins<TPlugins>,
		readonly [...TShapes, ...SlotsOf<TPlugins, 'shape'>],
		readonly [...TFactories, ...SlotsOf<TPlugins, 'factories'>]
	>
	readonly Schema: SchemaNamespace<AppTypes<TRules, TAdded, TShapes>>
	new <const TSchemas extends readonly unknown[]>(options: ApplicationOptions<TRules, TSchemas>): Application<TSchemas>
}

/** Configured factory plus the schema factories of installed plugins (`App.RoleSchema`). */
export type Factory<TRules extends readonly unknown[], TAdded, TShapes extends readonly unknown[], TFactories extends readonly unknown[]> = ConfiguredFactory<
	TRules,
	TAdded,
	TShapes,
	TFactories
> &
	SchemaFactoriesFor<TFactories, AppTypes<TRules, TAdded, TShapes>>

// Cast: the runtime validates `unknown` declarations; this typed facade is a model of
// Core's public types and is checked by the fixture, not by the runtime implementation.
export const UltimaBase = createFactory([]) as unknown as Factory<readonly [], Readonly<Record<never, never>>, readonly [], readonly []>
