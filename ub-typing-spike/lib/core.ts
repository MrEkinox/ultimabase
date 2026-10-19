// Core model: field builder, configured factory (`UltimaBase.use(...)`), the schema
// declaration form of each variant, the schema query surface and registration.
// Core never names a plugin. A plugin contributes schema options through a
// higher-kinded interface (`SchemaOptionsHKT`) evaluated against the complete schema.

import type {
	CreateInput,
	FieldsOf,
	FindManyArgs,
	PointerField,
	RelationField,
	ResolveTarget,
	Result,
	ScalarField,
	SystemFields,
} from './types.ts'

// ---------------------------------------------------------------- field builder

/** Options shared by scalar fields. */
export interface ScalarOptions<TRequired extends boolean, TValue> {
	/** Requires a non-null value on creation. @example `required: true` */
	readonly required?: TRequired
	/** Value used when creation omits the field. */
	readonly default?: TValue
	/** Human-readable documentation kept in the compiled schema. */
	readonly description?: string
}

/**
 * Constraint of a relationship target: a thunk (`() => User`) or a registered name.
 * Deliberately `object | string`: a function-typed constraint such as `() => void`
 * makes TypeScript evaluate the thunk's return type while inferring, which resolves
 * the target schema at declaration time and chains resolution along relation rings
 * (stack overflow at 50 schemas, reproduced in scratch/bisect). Non-thunk objects are
 * rejected at registration ("unknown target").
 */
export type SchemaTarget = object | string

/** Options of one pointer field. */
export interface PointerOptions<TTarget, TRequired extends boolean> {
	/** Target schema. @example `target: () => User` */
	readonly target: TTarget
	readonly required?: TRequired
	readonly onDelete?: 'restrict' | 'cascade' | 'setNull'
	readonly description?: string
}

/** Options of one relation field. */
export interface RelationOptions<TTarget, TMappedBy extends string | undefined> {
	/** Target schema. @example `target: () => Todo` */
	readonly target: TTarget
	/** Pointer field of the target that owns this inverse relation. @example `mappedBy: 'assignee'` */
	readonly mappedBy?: TMappedBy
	readonly description?: string
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

// ---------------------------------------------------------------- plugin type contributions

/**
 * Higher-kinded slot: a plugin declares `interface X extends SchemaOptionsHKT {
 * readonly options: AccessSchemaOption<this['schema']> }`. Core substitutes the
 * complete schema for `this['schema']`; it never knows the option's name.
 */
export interface SchemaOptionsHKT {
	readonly schema: unknown
	readonly options: object
}

/** Static type contribution of one installed plugin. */
export interface PluginDefinition<TId extends string = string, TOptions extends SchemaOptionsHKT = SchemaOptionsHKT, TFields extends object = object> {
	readonly id: TId
	readonly '~schemaOptions'?: TOptions
	readonly '~fields'?: TFields
}

type ApplyOptions<THKT, TSchema> = THKT extends SchemaOptionsHKT ? (THKT & { readonly schema: TSchema })['options'] : unknown

/**
 * Every installed option slot evaluated against one complete schema. Slots are kept
 * in a tuple: intersecting several `this`-typed HKT interfaces makes TypeScript
 * instantiate them without end (TS2589, reproduced in scratch/hkt/b.ts).
 */
export type SchemaOptionsFor<THKTs, TSchema> = THKTs extends readonly [infer THead, ...infer TRest]
	? ApplyOptions<THead, TSchema> & SchemaOptionsFor<TRest, TSchema>
	: unknown

type PluginOptionsHKT<TPlugin> = TPlugin extends PluginDefinition<string, infer THKT, object> ? THKT : SchemaOptionsHKT
type PluginFields<TPlugin> = TPlugin extends PluginDefinition<string, SchemaOptionsHKT, infer TFields> ? TFields : object

/** Complete field map: declared fields, Core system fields and plugin fields. */
export type CompleteFields<TDeclared, TAdded> = Readonly<TDeclared & SystemFields & TAdded>

// ---------------------------------------------------------------- schema query surface

/** Static query surface; `this` is the schema itself, so hovers name it when it is a class. */
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

/** One declared schema (variant A). */
export interface SchemaClass<TName extends string, TFields> extends SchemaQueries {
	readonly className: TName
	readonly '~fields': TFields
}

/** Variant B: keeps the exact option object for registration-time validation. */
export interface LooseOptionsSchemaClass<TName extends string, TFields, TOptions> extends SchemaClass<TName, TFields> {
	readonly '~options': TOptions
}

/** Variants C and D: two-phase schema; `.with()` is one non-generic signature. */
export interface ConfigurableSchemaClass<TName extends string, TFields, THKTs> extends SchemaClass<TName, TFields> {
	/**
	 * Adds plugin options typed against the complete schema.
	 * @example `.with({ access: { read: true } })`
	 */
	with(options: SchemaOptionsFor<THKTs, this>): this
}

/** Immutable model instance (persistence methods omitted in this model). */
export interface SchemaModel {
	readonly id: string
}

/** Variant E: base class returned by `App.Schema(name, fields)`. */
export interface SchemaBaseClass<TName extends string, TFields, THKTs> extends SchemaQueries {
	new (): SchemaModel
	readonly className: TName
	readonly '~fields': TFields
	/**
	 * Types plugin options against the complete schema class.
	 * @example `static readonly options = Todo.configure({ access: { read: true } })`
	 */
	configure(options: SchemaOptionsFor<THKTs, this>): SchemaOptionsFor<THKTs, this>
}

// ---------------------------------------------------------------- schema declaration forms

/** Declaration fields common to every object form. */
export interface SchemaDeclaration<TName extends string, TFields> {
	/** Runtime class name. */
	readonly className: TName
	/** Field declarations; relation targets are thunks (`() => User`) or names. */
	readonly fields: (field: FieldBuilder) => TFields
}

/** Replaces callback return types with `void` so checking never needs their bodies. */
export type Loosen<TValue> = TValue extends (...args: infer TArgs) => unknown
	? (...args: TArgs) => void
	: TValue extends object
		? { readonly [K in keyof TValue]: Loosen<TValue[K]> }
		: TValue

/** Schema namespace of one configured factory. */
export interface SchemaNamespace<THKTs, TAdded> {
	/** Variant E: base class for `class Todo extends App.Schema('Todo', (field) => ({ ... })) {}`. */
	<const TName extends string, const TFields>(
		className: TName,
		fields: (field: FieldBuilder) => TFields,
	): SchemaBaseClass<TName, CompleteFields<TFields, TAdded>, THKTs>
	/** Variant A: one object; plugin options checked inline with exact callback returns. */
	define<const TName extends string, const TFields>(
		declaration: SchemaDeclaration<TName, TFields> & SchemaOptionsFor<THKTs, SchemaClass<TName, CompleteFields<TFields, TAdded>>>,
	): SchemaClass<TName, CompleteFields<TFields, TAdded>>
	/**
	 * Variant B: one object; option callbacks are contextually typed but their return
	 * types are loosened to `void`, so resolving the schema never checks their bodies.
	 * Returned values are therefore not checked by TypeScript (Runtime validates them).
	 */
	defineLoose<const TName extends string, const TFields>(
		declaration: SchemaDeclaration<TName, TFields> & Loosen<SchemaOptionsFor<THKTs, SchemaClass<TName, CompleteFields<TFields, TAdded>>>>,
	): SchemaClass<TName, CompleteFields<TFields, TAdded>>
	/** Variants C and D: declare fields, then `.with({ ... })` plugin options. */
	declare<const TName extends string, const TFields>(
		declaration: SchemaDeclaration<TName, TFields>,
	): ConfigurableSchemaClass<TName, CompleteFields<TFields, TAdded>, THKTs>
}

// ---------------------------------------------------------------- registration

type NameOf<TSchema> = TSchema extends { readonly className: infer TName extends string } ? TName : never

type TargetIssue<TSchema, TKey, TTarget> = [ResolveTarget<TTarget>] extends [never]
	? `${NameOf<TSchema>}.${TKey & string}: unknown target '${TTarget & string}'`
	: never

type RelationIssues<TSchema> = {
	[K in keyof FieldsOf<TSchema>]: FieldsOf<TSchema>[K] extends RelationField<infer TTarget, infer TMappedBy>
		? [TargetIssue<TSchema, K, TTarget>] extends [never]
			? TMappedBy extends string
				? TMappedBy extends keyof FieldsOf<ResolveTarget<TTarget>>
					? never
					: `${NameOf<TSchema>}.${K & string}: mappedBy '${TMappedBy}' is not a field of ${NameOf<ResolveTarget<TTarget>>}`
				: never
			: TargetIssue<TSchema, K, TTarget>
		: FieldsOf<TSchema>[K] extends PointerField<infer TTarget>
			? TargetIssue<TSchema, K, TTarget>
			: never
}[keyof FieldsOf<TSchema>]

type OptionIssues<TSchema, THKTs> = TSchema extends LooseOptionsSchemaClass<string, unknown, infer TOptions>
	? TOptions extends SchemaOptionsFor<THKTs, TSchema>
		? never
		: `${NameOf<TSchema>}: a plugin option callback returns a value of the wrong type`
	: never

/** Registration error shown in place of one invalid schema. */
export interface SchemaRegistrationError<TMessage extends string> {
	readonly '~error': TMessage
}

/** Each registered schema, or a readable error instead of it. */
export type CheckedSchemas<TSchemas extends readonly unknown[], THKTs> = {
	readonly [K in keyof TSchemas]: [RelationIssues<TSchemas[K]> | OptionIssues<TSchemas[K], THKTs>] extends [never]
		? TSchemas[K]
		: SchemaRegistrationError<RelationIssues<TSchemas[K]> | OptionIssues<TSchemas[K], THKTs>>
}

/** Registration options of one application instance. */
export interface ApplicationOptions<TSchemas extends readonly unknown[]> {
	readonly schemas: TSchemas
}

/** One application instance. */
export interface Application<TSchemas extends readonly unknown[]> {
	readonly schemas: TSchemas
	start(): Promise<void>
}

/** Immutable configured factory returned by `UltimaBase.use(...)`. */
export interface ConfiguredFactory<THKTs extends readonly unknown[], TAdded> {
	use<const TPlugin extends PluginDefinition>(plugin: TPlugin): ConfiguredFactory<readonly [...THKTs, PluginOptionsHKT<TPlugin>], TAdded & PluginFields<TPlugin>>
	readonly Schema: SchemaNamespace<THKTs, TAdded>
	new <const TSchemas extends readonly unknown[]>(options: ApplicationOptions<TSchemas & CheckedSchemas<TSchemas, THKTs>>): Application<TSchemas>
}

export declare const UltimaBase: ConfiguredFactory<readonly [], Readonly<Record<never, never>>>

/** Plugin options of one schema for one configured factory (variant E, annotation form). */
export type SchemaOptionsOf<TFactory, TSchema> = TFactory extends ConfiguredFactory<infer THKTs, unknown> ? SchemaOptionsFor<THKTs, TSchema> : never
