import type { CreateInput, FieldsOf, FindManyArgs, PointerField, RelationField, ResolveTarget, Result, ScalarField, SchemaRef, SystemFields } from './types.ts';
/** Options shared by scalar fields. */
export interface ScalarOptions<TRequired extends boolean, TValue> {
    /** Requires a non-null value on creation. @example `required: true` */
    readonly required?: TRequired;
    /** Value used when creation omits the field. */
    readonly default?: TValue;
    readonly description?: string;
}
/** Relationship target: a thunk (`() => User`); kept unevaluated (see lib/core.ts). */
export type SchemaTarget = object;
/** Options of one pointer field. */
export interface PointerOptions<TTarget, TRequired extends boolean> {
    /** Target schema. @example `target: () => User` */
    readonly target: TTarget;
    readonly required?: TRequired;
    readonly onDelete?: 'restrict' | 'cascade' | 'setNull';
}
/** Options of one relation field. */
export interface RelationOptions<TTarget, TMappedBy extends string | undefined> {
    /** Target schema. @example `target: () => Todo` */
    readonly target: TTarget;
    /** Pointer field of the target that owns this inverse relation. */
    readonly mappedBy?: TMappedBy;
}
/** Field factory passed to `fields: (field) => ({ ... })`. */
export interface FieldBuilder {
    string<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, string>): ScalarField<'string', string, TRequired>;
    int<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, number>): ScalarField<'int', number, TRequired>;
    boolean<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, boolean>): ScalarField<'boolean', boolean, TRequired>;
    date<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, Date>): ScalarField<'date', Date, TRequired>;
    enum<const TValues extends readonly string[], const TRequired extends boolean = false>(options: ScalarOptions<TRequired, TValues[number]> & {
        readonly values: TValues;
    }): ScalarField<'enum', TValues[number], TRequired>;
    pointer<const TTarget extends SchemaTarget, const TRequired extends boolean = false>(options: PointerOptions<TTarget, TRequired>): PointerField<TTarget, TRequired>;
    relation<const TTarget extends SchemaTarget, const TMappedBy extends string | undefined = undefined>(options: RelationOptions<TTarget, TMappedBy>): RelationField<TTarget, TMappedBy>;
}
/**
 * Higher-kinded slot for chained schema methods. A plugin writes
 * `interface X extends SchemaMethodsHKT { readonly methods: { access: SchemaMethod<[options: AccessOptions<this['schema']>]> } }`;
 * Core substitutes a short reference to the schema for `this['schema']`.
 */
export interface SchemaMethodsHKT {
    readonly schema: unknown;
    readonly methods: object;
}
/**
 * One chained method: its parameters and the fields it adds to the schema type.
 * A method that adds fields is a shape method; it must be called before any other.
 */
export interface SchemaMethod<TArgs extends readonly unknown[] = readonly [], TFields extends object = Readonly<Record<never, never>>> {
    readonly '~args': TArgs;
    readonly '~fields': TFields;
}
/** Static type contribution of one installed plugin. */
export interface PluginDefinition<TId extends string = string, TMethods extends SchemaMethodsHKT = SchemaMethodsHKT, TFields extends object = object> {
    readonly id: TId;
    readonly '~schemaMethods'?: TMethods;
    readonly '~fields'?: TFields;
}
/** Plugin with no schema method. */
export interface NoSchemaMethods extends SchemaMethodsHKT {
    readonly methods: Readonly<Record<never, never>>;
}
/**
 * The schema reference is wrapped in an object literal type so that `SchemaRef<TSelf>`
 * is evaluated only when a method parameter reads `this['schema']`, never while the
 * chain's keys or return types are computed (that would read the registry while the
 * schema constant is being typed: TS7022, micro/e10).
 */
type ApplyMethods<THKT, TSelf> = THKT extends SchemaMethodsHKT ? (THKT & {
    readonly schema: SchemaRef<TSelf>;
})['methods'] : unknown;
/** Methods of every installed slot (tuple: see lib/core.ts on TS2589). */
export type SchemaMethodsFor<THKTs, TSelf> = THKTs extends readonly [infer THead, ...infer TRest] ? ApplyMethods<THead, TSelf> & SchemaMethodsFor<TRest, TSelf> : unknown;
/** Schema-independent view of the methods: names and added fields only. */
type MethodShapes<THKTs> = SchemaMethodsFor<THKTs, never>;
type AddedFields<TMethod> = TMethod extends SchemaMethod<readonly unknown[], infer TFields> ? TFields : never;
type MethodArgs<TMethod> = TMethod extends SchemaMethod<infer TArgs, object> ? TArgs : never;
type ShapeMethodNames<THKTs> = {
    [K in keyof MethodShapes<THKTs>]: keyof AddedFields<MethodShapes<THKTs>[K]> extends never ? never : K;
}[keyof MethodShapes<THKTs>];
/** Chain state: methods already called, and whether shape methods are still allowed. */
export interface ChainState<TUsed extends PropertyKey = PropertyKey, TShapeOpen extends boolean = boolean> {
    readonly used: TUsed;
    readonly shapeOpen: TShapeOpen;
}
type AvailableMethods<THKTs, TState extends ChainState> = Exclude<keyof MethodShapes<THKTs>, TState['used'] | (TState['shapeOpen'] extends true ? never : ShapeMethodNames<THKTs>)>;
type NextState<THKTs, TState extends ChainState, K> = ChainState<TState['used'] | (K & PropertyKey), TState['shapeOpen'] extends true ? (K extends ShapeMethodNames<THKTs> ? true : false) : false>;
/** Type-level configuration of one factory. */
export interface AppTypes<THKTs = unknown, TAdded = unknown> {
    readonly '~hkts': THKTs;
    readonly '~added': TAdded;
}
/** Complete field map: declared fields, Core system fields and plugin fields. */
export type CompleteFields<TDeclared, TAdded> = Readonly<TDeclared & SystemFields & TAdded>;
/** Static query surface; `this` is the schema itself. */
export interface SchemaQueries {
    findMany<TSelf, const TArgs extends FindManyArgs<TSelf> = Readonly<Record<never, never>>>(this: TSelf, args?: TArgs): Promise<Simplify<Result<TSelf, TArgs>>[]>;
    createOne<TSelf, const TArgs extends CreateArgs<TSelf>>(this: TSelf, args: TArgs): Promise<Simplify<Result<TSelf, TArgs>>>;
}
/** Prints the resolved object in editors instead of the alias. */
export type Simplify<TValue> = {
    [K in keyof TValue]: TValue[K];
} & {};
/** Arguments of `createOne`. */
export interface CreateArgs<TSchema> extends Omit<FindManyArgs<TSchema>, 'where' | 'orderBy' | 'limit' | 'offset'> {
    readonly data: CreateInput<TSchema>;
}
/** One defined schema at one point of its method chain. */
export interface DefinedSchema<TName extends string, TFields, TApp extends AppTypes, TState extends ChainState> extends SchemaQueries {
    readonly className: TName;
    readonly '~fields': CompleteFields<TFields, TApp['~added']>;
    readonly '~chain': TState;
}
/**
 * Chained plugin methods. Each one is a single non-generic signature: TypeScript types
 * `const Todo = ...chain` from the return types alone and checks callbacks afterwards,
 * when every schema is resolved (same mechanism as D's `.with`).
 */
export type SchemaChain<TName extends string, TFields, TApp extends AppTypes, TState extends ChainState> = {
    readonly [K in AvailableMethods<TApp['~hkts'], TState> & string]: (...args: MethodArgs<SchemaMethodsFor<TApp['~hkts'], DefinedSchema<TName, TFields, TApp, TState>>[K]>) => Schema<TName, TFields & AddedFields<MethodShapes<TApp['~hkts']>[K]>, TApp, NextState<TApp['~hkts'], TState, K>>;
};
/** Value returned by `App.Schema.define(...)` and by every chained method. */
export type Schema<TName extends string, TFields, TApp extends AppTypes, TState extends ChainState> = DefinedSchema<TName, TFields, TApp, TState> & SchemaChain<TName, TFields, TApp, TState>;
/** Declaration of one schema. */
export interface SchemaDeclaration<TName extends string, TFields> {
    /** Runtime class name. */
    readonly className: TName;
    /** Field declarations; relation targets are thunks (`() => User`). */
    readonly fields: (field: FieldBuilder) => TFields;
}
/** Schema namespace of one configured factory. */
export interface SchemaNamespace<THKTs, TAdded> {
    /** Declares fields; installed plugins then contribute chained methods. */
    define<const TName extends string, const TFields>(declaration: SchemaDeclaration<TName, TFields>): Schema<TName, TFields, AppTypes<THKTs, TAdded>, ChainState<never, true>>;
}
type NameOf<TSchema> = TSchema extends {
    readonly className: infer TName extends string;
} ? TName : never;
type RelationIssues<TSchema> = {
    [K in keyof FieldsOf<TSchema>]: FieldsOf<TSchema>[K] extends RelationField<infer TTarget, infer TMappedBy> ? TMappedBy extends string ? TMappedBy extends keyof FieldsOf<ResolveTarget<TTarget>> ? never : `${NameOf<TSchema>}.${K & string}: mappedBy '${TMappedBy}' is not a field of ${NameOf<ResolveTarget<TTarget>>}` : never : never;
}[keyof FieldsOf<TSchema>];
/** Registration error shown in place of one invalid schema. */
export interface SchemaRegistrationError<TMessage extends string> {
    readonly '~error': TMessage;
}
/** Each registered schema, or a readable error instead of it. */
export type CheckedSchemas<TSchemas extends readonly unknown[]> = {
    readonly [K in keyof TSchemas]: [RelationIssues<TSchemas[K]>] extends [never] ? TSchemas[K] : SchemaRegistrationError<RelationIssues<TSchemas[K]>>;
};
/** One application instance. */
export interface Application<TSchemas extends readonly unknown[]> {
    readonly schemas: TSchemas;
    start(): Promise<void>;
}
type PluginMethodsHKT<TPlugin> = TPlugin extends PluginDefinition<string, infer THKT, object> ? THKT : NoSchemaMethods;
type PluginFields<TPlugin> = TPlugin extends PluginDefinition<string, SchemaMethodsHKT, infer TFields> ? TFields : object;
/** Immutable configured factory returned by `UltimaBase.use(...)`. */
export interface ConfiguredFactory<THKTs extends readonly unknown[], TAdded> {
    use<const TPlugin extends PluginDefinition>(plugin: TPlugin): ConfiguredFactory<readonly [...THKTs, PluginMethodsHKT<TPlugin>], TAdded & PluginFields<TPlugin>>;
    readonly Schema: SchemaNamespace<THKTs, TAdded>;
    new <const TSchemas extends readonly unknown[]>(options: {
        readonly schemas: TSchemas & CheckedSchemas<TSchemas>;
    }): Application<TSchemas>;
}
export declare const UltimaBase: ConfiguredFactory<readonly [], Readonly<Record<never, never>>>;
export {};
