import type { CreateInput, FieldsOf, FindManyArgs, Model, PointerField, RelationField, ResolveTarget, Result, ScalarField, SystemFields } from './types.ts';
/** One named enum shared by several fields (`defineEnum('TodoPriority', [...])`). */
export interface EnumDefinition<TName extends string = string, TValue extends string = string> {
    readonly name: TName;
    readonly values: readonly TValue[];
}
/** Declares one named enum reusable by several fields and schemas. @example `defineEnum('TodoPriority', ['low', 'high'])` */
export declare const defineEnum: <const TName extends string, const TValues extends readonly string[]>(name: TName, values: TValues) => EnumDefinition<TName, TValues[number]>;
type EnumValues<TValues> = TValues extends EnumDefinition<string, infer TValue> ? TValue : TValues extends readonly (infer TValue)[] ? TValue : never;
/**
 * Higher-kinded slot for field options contributed by a plugin (`hooks: { resolveInput }`).
 * Core substitutes the field's value type for `this['value']`.
 */
export interface FieldOptionsHKT {
    readonly value: unknown;
    readonly options: object;
}
type ApplyFieldOptions<THKT, TValue> = THKT extends FieldOptionsHKT ? (THKT & {
    readonly value: TValue;
})['options'] : unknown;
/** Field options of every installed plugin for one value type (tuple: see SchemaOptionsFor). */
export type FieldOptionsFor<THKTs, TValue> = THKTs extends readonly [infer THead, ...infer TRest] ? ApplyFieldOptions<THead, TValue> & FieldOptionsFor<TRest, TValue> : unknown;
/** Options shared by scalar fields. */
export interface ScalarOptions<TRequired extends boolean, TValue> {
    /** Requires a non-null value on creation. @example `required: true` */
    readonly required?: TRequired;
    /** Value used when creation omits the field. */
    readonly default?: TValue;
    /** Rejects invalid values; returns an error message or `true`. @example `validate: (title) => title.length > 0 || 'empty'` */
    readonly validate?: (value: TValue) => true | string;
    readonly description?: string;
}
/**
 * Constraint of a relationship target thunk. Deliberately `object`: a function-typed
 * constraint makes TypeScript evaluate the thunk while inferring (see lib/core.ts).
 */
export type SchemaTarget = object;
/** Options of one pointer field. */
export interface PointerOptions<TTarget, TRequired extends boolean> {
    /** Target schema. @example `target: () => User` */
    readonly target: TTarget;
    readonly required?: TRequired;
    readonly onDelete?: 'restrict' | 'cascade' | 'setNull';
    readonly description?: string;
}
/** Options of one relation field. */
export interface RelationOptions<TTarget, TMappedBy extends string | undefined> {
    /** Target schema. @example `target: () => Todo` */
    readonly target: TTarget;
    /** Pointer field of the target that owns this inverse relation. @example `mappedBy: 'assignee'` */
    readonly mappedBy?: TMappedBy;
    readonly description?: string;
}
/** Options of one enum field: inline values or a shared `defineEnum` definition. */
export interface EnumOptions<TValues, TList extends boolean> {
    /** Allowed values. @example `values: ['open', 'done']` or `values: TodoPriority` */
    readonly values: TValues;
    /** Stores a list of values. @example `list: true` */
    readonly list?: TList;
}
type EnumField<TValue, TRequired extends boolean, TList> = TList extends true ? ScalarField<'enumList', readonly TValue[], TRequired> : ScalarField<'enum', TValue, TRequired>;
/** Field factory passed to `(field) => ({ ... })`; `TExtra` are installed plugin field options. */
export interface FieldBuilder<TExtra = unknown> {
    string<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, string> & FieldOptionsFor<TExtra, string>): ScalarField<'string', string, TRequired>;
    int<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, number> & FieldOptionsFor<TExtra, number>): ScalarField<'int', number, TRequired>;
    boolean<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, boolean> & FieldOptionsFor<TExtra, boolean>): ScalarField<'boolean', boolean, TRequired>;
    date<const TRequired extends boolean = false>(options?: ScalarOptions<TRequired, Date> & FieldOptionsFor<TExtra, Date>): ScalarField<'date', Date, TRequired>;
    enum<const TValues extends readonly string[] | EnumDefinition, const TRequired extends boolean = false, const TList extends boolean = false>(options: EnumOptions<TValues, TList> & ScalarOptions<TRequired, TList extends true ? readonly EnumValues<TValues>[] : EnumValues<TValues>>): EnumField<EnumValues<TValues>, TRequired, TList>;
    pointer<const TTarget extends SchemaTarget, const TRequired extends boolean = false>(options: PointerOptions<TTarget, TRequired>): PointerField<TTarget, TRequired>;
    relation<const TTarget extends SchemaTarget, const TMappedBy extends string | undefined = undefined>(options: RelationOptions<TTarget, TMappedBy>): RelationField<TTarget, TMappedBy>;
}
/**
 * Higher-kinded slot: a plugin declares `interface X extends SchemaOptionsHKT {
 * readonly options: AccessSchemaOption<this['schema']> }`. Core substitutes the
 * complete schema for `this['schema']`; it never knows the option's name.
 */
export interface SchemaOptionsHKT {
    readonly schema: unknown;
    readonly options: object;
}
/**
 * One shape method (`.softDelete()`), called on the base class expression before the
 * class body. It is schema-independent: its arguments and added fields never read the
 * schema, so calling it in `extends` cannot create a cycle.
 */
export interface ShapeMethod<TArgs extends readonly unknown[] = readonly [], TFields extends object = Readonly<Record<never, never>>> {
    readonly '~args': TArgs;
    readonly '~fields': TFields;
}
/**
 * Higher-kinded slot for schema factories on the application (`App.RoleSchema`).
 * Core substitutes the application's final type configuration for `this['app']`.
 */
export interface SchemaFactoriesHKT {
    readonly app: AppTypes;
    readonly factories: object;
}
/** Static type contributions of one plugin; every member is optional. */
export interface PluginTypes {
    /** Schema rule entries (`access`, `hooks`), typed against the complete schema. */
    readonly schemaOptions?: SchemaOptionsHKT;
    /** Fields added to every schema (`acl`). */
    readonly fields?: object;
    /** Shape methods available on `App.Schema(...)` (`softDelete`). */
    readonly shapeMethods?: object;
    /** Schema factories on the application (`RoleSchema`). */
    readonly factories?: SchemaFactoriesHKT;
    /** Field options (`hooks: { resolveInput }`). */
    readonly fieldOptions?: FieldOptionsHKT;
}
/** Static type contribution of one installed plugin. */
export interface PluginDefinition<TId extends string = string, TTypes extends PluginTypes = PluginTypes> {
    readonly id: TId;
    readonly '~types'?: TTypes;
}
/** Type-level configuration of one configured factory (tuples of plugin slots). */
export interface AppTypes<TOptions = unknown, TAdded = unknown, TShapes = unknown, TFactories = unknown, TFieldOptions = unknown> {
    readonly '~options': TOptions;
    readonly '~added': TAdded;
    readonly '~shapes': TShapes;
    readonly '~factories': TFactories;
    readonly '~fieldOptions': TFieldOptions;
}
type EmptyApp = AppTypes<readonly [], Readonly<Record<never, never>>, Readonly<Record<never, never>>, readonly [], readonly []>;
type TypesOf<TPlugin> = TPlugin extends PluginDefinition<string, infer TTypes> ? TTypes : PluginTypes;
type Slot<TTypes, TKey extends string, TDefault> = TTypes extends {
    readonly [K in TKey]?: infer TValue;
} ? (unknown extends TValue ? TDefault : Exclude<TValue, undefined>) : TDefault;
type Tuple<TValue> = TValue extends readonly unknown[] ? TValue : readonly [];
type InstallOne<TApp extends AppTypes, TTypes> = AppTypes<readonly [...Tuple<TApp['~options']>, Slot<TTypes, 'schemaOptions', NoSchemaOptions>], TApp['~added'] & Slot<TTypes, 'fields', Readonly<Record<never, never>>>, TApp['~shapes'] & Slot<TTypes, 'shapeMethods', Readonly<Record<never, never>>>, readonly [...Tuple<TApp['~factories']>, Slot<TTypes, 'factories', NoSchemaFactories>], readonly [...Tuple<TApp['~fieldOptions']>, Slot<TTypes, 'fieldOptions', NoFieldOptions>]>;
/** Application configuration after installing a list of plugins. */
export type Install<TApp extends AppTypes, TPlugins> = TPlugins extends readonly [infer THead, ...infer TRest] ? Install<InstallOne<TApp, TypesOf<THead>>, TRest> : TApp;
/** Plugin without schema options. */
export interface NoSchemaOptions extends SchemaOptionsHKT {
    readonly options: Readonly<Record<never, never>>;
}
/** Plugin without schema factories. */
export interface NoSchemaFactories extends SchemaFactoriesHKT {
    readonly factories: Readonly<Record<never, never>>;
}
/** Plugin without field options. */
export interface NoFieldOptions extends FieldOptionsHKT {
    readonly options: Readonly<Record<never, never>>;
}
type ApplyOptions<THKT, TSchema> = THKT extends SchemaOptionsHKT ? (THKT & {
    readonly schema: TSchema;
})['options'] : unknown;
/**
 * Every installed option slot evaluated against one complete schema. Slots are kept
 * in a tuple: intersecting several `this`-typed HKT interfaces makes TypeScript
 * instantiate them without end (TS2589, reproduced in scratch/hkt/b.ts).
 */
export type SchemaOptionsFor<THKTs, TSchema> = THKTs extends readonly [infer THead, ...infer TRest] ? ApplyOptions<THead, TSchema> & SchemaOptionsFor<TRest, TSchema> : unknown;
/** Field builder of one application (Core options plus installed plugin field options). */
export type AppFieldBuilder<TApp extends AppTypes> = FieldBuilder<TApp['~fieldOptions']>;
/** Complete field map: declared fields, Core system fields and plugin fields. */
export type CompleteFields<TDeclared, TAdded> = Readonly<TDeclared & SystemFields & TAdded>;
/** Per-query options. */
export interface QueryOptions {
    /** Runs with Master authority (server-side only). @example `{ useMasterKey: true }` */
    readonly useMasterKey?: boolean;
}
/** Static query surface; `this` is the schema class, so hovers name it. */
export interface SchemaQueries {
    findMany<TSelf, const TArgs extends FindManyArgs<TSelf> = Readonly<Record<never, never>>>(this: TSelf, args?: TArgs, options?: QueryOptions): Promise<Simplify<Result<TSelf, TArgs>>[]>;
    findOne<TSelf, const TArgs extends FindManyArgs<TSelf> = Readonly<Record<never, never>>>(this: TSelf, args?: TArgs, options?: QueryOptions): Promise<Simplify<Result<TSelf, TArgs>> | null>;
    createOne<TSelf, const TArgs extends CreateArgs<TSelf>>(this: TSelf, args: TArgs, options?: QueryOptions): Promise<Simplify<Result<TSelf, TArgs>>>;
}
/** Prints the resolved object in editors instead of the alias. */
export type Simplify<TValue> = {
    [K in keyof TValue]: TValue[K];
} & {};
/** Arguments of `createOne`. */
export interface CreateArgs<TSchema> extends Omit<FindManyArgs<TSchema>, 'where' | 'orderBy' | 'limit' | 'offset'> {
    readonly data: CreateInput<TSchema>;
}
/** Statics every schema class inherits from its base. */
export interface SchemaStatics<TName extends string, TFields> extends SchemaQueries {
    /** Runtime class name. */
    readonly className: TName;
    readonly '~fields': TFields;
}
/** Construct signature: the class instance type is the immutable model. */
export interface SchemaConstructor<TFields> {
    new (): Model<TFields>;
}
type ShapeArgs<TMethod> = TMethod extends ShapeMethod<infer TArgs, object> ? TArgs : never;
type ShapeFields<TMethod> = TMethod extends ShapeMethod<readonly unknown[], infer TFields> ? TFields : never;
/** Shape methods not called yet; each returns a new base with the added fields. */
type ShapeMethods<TName extends string, TDeclared, TApp extends AppTypes, TModel, TUsed> = {
    readonly [K in Exclude<keyof TApp['~shapes'], TUsed> & string]: (...args: ShapeArgs<TApp['~shapes'][K]>) => SchemaBase<TName, TDeclared & ShapeFields<TApp['~shapes'][K]>, TApp, TModel, TUsed | K>;
};
/**
 * Rule methods, one per installed plugin option (`this.access(...)`, `this.hooks(...)`),
 * called in the class's static block. Keys are computed without any schema; each method
 * is generic over its receiver (`this: TSelf`), so `TSelf` is the class being declared
 * (a polymorphic `this` would be bound to the base class, see form E2). Static blocks
 * never contribute to the class type: no inference, no cycle. Registration seals them.
 */
export type RuleMethods<TOptionHKTs> = {
    readonly [K in keyof SchemaOptionsFor<TOptionHKTs, never>]-?: <TSelf>(this: TSelf, options: RuleOptions<TOptionHKTs, TSelf, K>) => void;
};
/** Options of one rule method for one schema class. */
export type RuleOptions<TOptionHKTs, TSelf, K> = Exclude<SchemaOptionsFor<TOptionHKTs, TSelf>[K & keyof SchemaOptionsFor<TOptionHKTs, TSelf>], undefined>;
type BaseMembers<TName extends string, TDeclared, TApp extends AppTypes, TModel, TUsed> = SchemaConstructor<CompleteFields<TDeclared, TApp['~added']>> & SchemaStatics<TName, CompleteFields<TDeclared, TApp['~added']>> & RuleMethods<TApp['~options']> & ShapeMethods<TName, TDeclared, TApp, TModel, TUsed> & TModel;
/**
 * Base class returned by `App.Schema(name, fields)` and by plugin factories; extended
 * by `class Todo extends App.Schema(...) { ... }`. `~statics` lists the statics the
 * base provides, so registration can reject members added by the class body.
 */
export type SchemaBase<TName extends string, TDeclared, TApp extends AppTypes, TModel = unknown, TUsed = never> = BaseMembers<TName, TDeclared, TApp, TModel, TUsed> & {
    readonly '~statics': keyof BaseMembers<TName, TDeclared, TApp, TModel, TUsed>;
};
/**
 * Base class created by a plugin factory: plugin-owned fields and model statics, a
 * factory brand checked at registration, then the ordinary shape methods.
 */
export type FactorySchemaBase<TFactory extends string, TName extends string, TDeclared, TApp extends AppTypes, TModel = unknown> = TApp extends AppTypes<infer TOptions, infer TAdded, infer TShapes, infer TFactories, infer TFieldOptions> ? SchemaBase<TName, TDeclared, AppTypes<TOptions, TAdded, TShapes, TFactories, TFieldOptions>, TModel & {
    readonly '~factory': TFactory;
}> : never;
/** `App.Schema`: base class of one application schema. */
export interface SchemaFactory<TApp extends AppTypes> {
    /**
     * Declares one schema class; rules go in a static block: `static { this.access({ ... }) }`.
     * @example `class Todo extends App.Schema('Todo', (field) => ({ title: field.string() })) {}`
     */
    <const TName extends string, const TFields>(className: TName, fields: (field: AppFieldBuilder<TApp>) => TFields): SchemaBase<TName, TFields, TApp>;
}
type NameOf<TSchema> = TSchema extends {
    readonly className: infer TName extends string;
} ? TName : never;
type RelationIssues<TSchema> = {
    [K in keyof FieldsOf<TSchema>]: FieldsOf<TSchema>[K] extends RelationField<infer TTarget, infer TMappedBy> ? TMappedBy extends string ? TMappedBy extends keyof FieldsOf<ResolveTarget<TTarget>> ? never : `${NameOf<TSchema>}.${K & string}: mappedBy '${TMappedBy}' is not a field of ${NameOf<ResolveTarget<TTarget>>}` : never : never;
}[keyof FieldsOf<TSchema>];
/**
 * One plugin factory creates exactly one registered schema. Only branded schemas are
 * compared, against the tuple's union (a pairwise check was quadratic, see lib-f).
 */
type FactoryIssues<TSchemas extends readonly unknown[], TSchema> = TSchema extends {
    readonly '~factory': infer TFactory extends string;
} ? [Exclude<Extract<TSchemas[number], {
    readonly '~factory': TFactory;
}>, TSchema>] extends [never] ? never : `${NameOf<TSchema>}: factory '${TFactory}' already created another registered schema` : never;
type InstanceOf<TSchema> = TSchema extends abstract new () => infer TInstance ? TInstance : never;
/** Statics the class body may declare in this form. */
type BodyStatics = 'prototype' | '~statics';
/**
 * Schemas are data plus rules: a class body may not add methods or properties (no
 * Active Record behaviour on the model, no ad hoc static API on the schema).
 */
type MemberIssues<TSchema> = TSchema extends {
    readonly '~statics': infer TStatics;
} ? (Exclude<keyof TSchema & string, TStatics | BodyStatics> extends infer TKey extends string ? TKey extends string ? `${NameOf<TSchema>}: custom static member '${TKey}' is not allowed; a schema class declares fields and rules only` : never : never) | (Exclude<keyof InstanceOf<TSchema> & string, keyof Model<FieldsOf<TSchema>>> extends infer TKey extends string ? TKey extends string ? `${NameOf<TSchema>}: custom instance member '${TKey}' is not allowed; models are immutable data without behaviour` : never : never) : never;
type SchemaIssues<TSchemas extends readonly unknown[], TSchema, TApp extends AppTypes> = RelationIssues<TSchema> | FactoryIssues<TSchemas, TSchema> | MemberIssues<TSchema>;
/** Registration error shown in place of one invalid schema. */
export interface SchemaRegistrationError<TMessage extends string> {
    readonly '~error': TMessage;
}
/** Each registered schema, or a readable error instead of it. */
export type CheckedSchemas<TSchemas extends readonly unknown[], TApp extends AppTypes> = {
    readonly [K in keyof TSchemas]: [SchemaIssues<TSchemas, TSchemas[K], TApp>] extends [never] ? TSchemas[K] : SchemaRegistrationError<JoinMessages<SchemaIssues<TSchemas, TSchemas[K], TApp>>>;
};
type UnionToIntersection<TUnion> = (TUnion extends unknown ? (value: TUnion) => void : never) extends (value: infer TIntersection) => void ? TIntersection : never;
type LastOf<TUnion> = UnionToIntersection<TUnion extends unknown ? (value: TUnion) => void : never> extends (value: infer TLast) => void ? TLast : never;
/**
 * Joins issue messages into one string: editors print a union of messages by its alias
 * (`SchemaIssues<...>`), never by its members. Only evaluated for an invalid schema.
 */
type JoinMessages<TMessages, TJoined extends string = ''> = [TMessages] extends [never] ? TJoined : LastOf<TMessages> extends infer TLast extends string ? JoinMessages<Exclude<TMessages, TLast>, TJoined extends '' ? TLast : `${TJoined}; ${TLast}`> : TJoined;
type FactoryNames<TApp extends AppTypes> = keyof SchemaFactoriesFor<TApp['~factories'], TApp> & string;
type UsedFactories<TSchemas extends readonly unknown[]> = TSchemas[number] extends infer TSchema ? TSchema extends {
    readonly '~factory': infer TFactory;
} ? TFactory : never : never;
/** Installed factories that created no registered schema ("exactly one" lower bound). */
export type MissingFactorySchemas<TSchemas extends readonly unknown[], TApp extends AppTypes> = [
    Exclude<FactoryNames<TApp>, UsedFactories<TSchemas>>
] extends [never] ? unknown : {
    readonly '~missingSchemas': `register one schema created by App.${Exclude<FactoryNames<TApp>, UsedFactories<TSchemas>>}`;
};
/** Registration options of one application instance. */
export interface ApplicationOptions<TSchemas extends readonly unknown[]> {
    readonly schemas: TSchemas;
}
/** One application instance. */
export interface Application<TSchemas extends readonly unknown[]> {
    readonly schemas: TSchemas;
    start(): Promise<void>;
}
type ApplyFactories<THKT, TApp> = THKT extends SchemaFactoriesHKT ? (THKT & {
    readonly app: TApp;
})['factories'] : unknown;
/** Factories of every installed slot, evaluated against the final application configuration. */
export type SchemaFactoriesFor<TFactoryHKTs, TApp> = TFactoryHKTs extends readonly [infer THead, ...infer TRest] ? ApplyFactories<THead, TApp> & SchemaFactoriesFor<TRest, TApp> : unknown;
/** Immutable configured factory returned by `UltimaBase.use(...)`. */
export interface ConfiguredFactory<TApp extends AppTypes> {
    /** Type-level configuration (no runtime value). */
    readonly '~app': TApp;
    /** Installs plugins; returns a new factory. @example `UltimaBase.use(accessPlugin(), hooksPlugin())` */
    use<const TPlugins extends readonly PluginDefinition[]>(...plugins: TPlugins): Factory<Install<TApp, TPlugins>>;
    /** Base class of one schema. @example `class Todo extends App.Schema('Todo', (field) => ({ ... })) {}` */
    readonly Schema: SchemaFactory<TApp>;
    new <const TSchemas extends readonly unknown[]>(options: ApplicationOptions<TSchemas & CheckedSchemas<TSchemas, TApp>> & MissingFactorySchemas<TSchemas, TApp>): Application<TSchemas>;
}
/** Configured factory plus the schema factories contributed by installed plugins. */
export type Factory<TApp extends AppTypes> = ConfiguredFactory<TApp> & SchemaFactoriesFor<TApp['~factories'], TApp>;
export declare const UltimaBase: Factory<EmptyApp>;
export {};
