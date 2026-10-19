import type { AppFieldBuilder, AppTypes, FactorySchemaBase, FieldOptionsHKT, PluginDefinition, SchemaFactoriesHKT, SchemaOptionsHKT, ShapeMethod } from './core.ts';
import type { CreateInput, Item, RelationField, ScalarField, ScalarKeys, SchemaName, Where, WhereBuilder, WhereExpression } from './types.ts';
/** Context received by one row filter. */
export interface AccessFilterContext<TSchema> {
    /** Builder bound to the complete schema. */
    readonly where: WhereBuilder<TSchema>;
    /** Authenticated user identity, if any. */
    readonly userId: string | null;
}
/** Row filter result: `undefined` = no filter, `false` = no row. */
export type AccessFilterResult<TSchema> = WhereExpression<SchemaName<TSchema>> | Where<TSchema> | false | undefined;
/** `true`/`false`, or a row filter. */
export type AccessRule<TSchema> = boolean | {
    readonly where: (context: AccessFilterContext<TSchema>) => AccessFilterResult<TSchema>;
};
/** Per-operation access rules of one schema. */
export interface AccessOptions<TSchema> {
    readonly read?: AccessRule<TSchema>;
    readonly create?: boolean;
    readonly update?: AccessRule<TSchema>;
    readonly delete?: AccessRule<TSchema>;
}
/** Schema option contributed by Access. */
export interface AccessSchemaOption<TSchema> {
    /** Row and operation access rules. @example `access: { read: true }` */
    readonly access?: AccessOptions<TSchema>;
}
export interface AccessSchemaOptions extends SchemaOptionsHKT {
    readonly options: AccessSchemaOption<this['schema']>;
}
export declare const accessPlugin: () => PluginDefinition<'access', {
    readonly schemaOptions: AccessSchemaOptions;
}>;
/** Arguments of a write hook. */
export interface WriteHookArgs<TSchema> {
    readonly item: Item<TSchema>;
    readonly originalItem: Item<TSchema> | null;
}
/** Schema-level hooks. */
export interface HooksOptions<TSchema> {
    readonly beforeSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>;
    readonly beforeUpdate?: (args: WriteHookArgs<TSchema>) => void | Promise<void>;
    readonly afterSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>;
    /** Rewrites create input; returns the input to persist. */
    readonly beforeCreate?: (data: CreateInput<TSchema>) => CreateInput<TSchema>;
}
/** Schema option contributed by Hooks. */
export interface HooksSchemaOption<TSchema> {
    /** Schema write hooks. @example `hooks: { beforeSave: ({ item }) => {} }` */
    readonly hooks?: HooksOptions<TSchema>;
}
export interface HooksSchemaOptions extends SchemaOptionsHKT {
    readonly options: HooksSchemaOption<this['schema']>;
}
/** Field option contributed by Hooks. */
export interface HooksFieldOption<TValue> {
    /** Field hooks. @example `hooks: { resolveInput: ({ value }) => value.trim() }` */
    readonly hooks?: {
        readonly resolveInput?: (args: {
            readonly value: TValue;
        }) => TValue;
    };
}
export interface HooksFieldOptions extends FieldOptionsHKT {
    readonly options: HooksFieldOption<this['value']>;
}
export declare const hooksPlugin: () => PluginDefinition<'hooks', {
    readonly schemaOptions: HooksSchemaOptions;
    readonly fieldOptions: HooksFieldOptions;
}>;
/** Immutable ACL value. */
export interface ACL {
    readonly '~acl': true;
    grantPublic(...permissions: readonly ('read' | 'update')[]): ACL;
    grantRole(role: string, ...permissions: readonly ('read' | 'update' | 'delete')[]): ACL;
}
/** Schema option contributed by ACL. */
export interface AclSchemaOption<TSchema> {
    /** Default ACL computed from the create input. @example `acl: { default: () => acl.grantRole('admin', 'read') }` */
    readonly acl?: {
        readonly default?: (data: CreateInput<TSchema>) => ACL;
    };
}
export interface AclSchemaOptions extends SchemaOptionsHKT {
    readonly options: AclSchemaOption<this['schema']>;
}
export declare const aclPlugin: () => PluginDefinition<'acl', {
    readonly schemaOptions: AclSchemaOptions;
    readonly fields: {
        readonly acl: ScalarField<'json', ACL, true>;
    };
}>;
/** Shape methods contributed by Soft Delete. */
export interface SoftDeleteShapeMethods {
    /** Adds `isDeleted` and hides deleted rows. @example `App.Schema('Todo', ...).softDelete()` */
    readonly softDelete: ShapeMethod<[], {
        readonly isDeleted: ScalarField<'boolean', boolean, true>;
    }>;
}
export declare const softDeletePlugin: () => PluginDefinition<'soft-delete', {
    readonly shapeMethods: SoftDeleteShapeMethods;
}>;
/** One index over scalar fields. */
export interface IndexDefinition<TSchema> {
    readonly fields: readonly ScalarKeys<TSchema>[];
    readonly unique?: boolean;
}
/** Schema option contributed by PostgreSQL. */
export interface PostgresSchemaOption<TSchema> {
    /** Physical storage options. @example `postgres: { table: 'todos', indexes: [{ fields: ['archived'] }] }` */
    readonly postgres?: {
        readonly table?: string;
        readonly indexes?: readonly IndexDefinition<TSchema>[];
    };
}
export interface PostgresSchemaOptions extends SchemaOptionsHKT {
    readonly options: PostgresSchemaOption<this['schema']>;
}
export declare const postgresPlugin: (options?: {
    readonly url?: string;
}) => PluginDefinition<'postgres', {
    readonly schemaOptions: PostgresSchemaOptions;
}>;
/** Fields every role schema owns. */
export interface RoleOwnedFields<TMembers> {
    readonly name: ScalarField<'string', string, true>;
    readonly members: RelationField<TMembers, undefined>;
}
/** Model statics of the role schema. */
export interface RoleModel {
    /** Adds one user to one role. */
    addMember(role: {
        readonly id: string;
    }, user: {
        readonly id: string;
    }): Promise<void>;
}
/** `App.RoleSchema`: base class of the application's role schema. */
export interface RoleSchemaFactory<TApp extends AppTypes> {
    <const TName extends string, const TMembers extends object, const TFields = Readonly<Record<never, never>>>(className: TName, declaration: {
        /** Schema of the role members. @example `members: () => User` */
        readonly members: TMembers;
        readonly fields?: (field: AppFieldBuilder<TApp>) => TFields;
    }): FactorySchemaBase<'RoleSchema', TName, TFields & RoleOwnedFields<TMembers>, TApp, RoleModel>;
}
export interface RoleFactoryTypes<TApp extends AppTypes> {
    readonly RoleSchema: RoleSchemaFactory<TApp>;
}
export interface RoleFactories extends SchemaFactoriesHKT {
    readonly factories: RoleFactoryTypes<this['app']>;
}
export declare const rolesPlugin: () => PluginDefinition<'roles', {
    readonly factories: RoleFactories;
}>;
/** Fields every password user schema owns. */
export interface PasswordUserOwnedFields {
    readonly username: ScalarField<'string', string, true>;
    readonly email: ScalarField<'string', string, true>;
}
/** Model statics of the password user schema; inputs typed from the schema itself. */
export interface PasswordUserModel {
    signUp<TSelf>(this: TSelf, input: CreateInput<TSelf> & {
        readonly password: string;
    }): Promise<{
        readonly id: string;
    }>;
    login(username: string, password: string): Promise<{
        readonly sessionToken: string;
    }>;
}
/** `App.PasswordUserSchema`: base class of the application's user schema. */
export interface PasswordUserSchemaFactory<TApp extends AppTypes> {
    <const TName extends string, const TFields>(className: TName, fields: (field: AppFieldBuilder<TApp>) => TFields): FactorySchemaBase<'PasswordUserSchema', TName, TFields & PasswordUserOwnedFields, TApp, PasswordUserModel>;
}
export interface PasswordUserFactoryTypes<TApp extends AppTypes> {
    readonly PasswordUserSchema: PasswordUserSchemaFactory<TApp>;
}
export interface PasswordUserFactories extends SchemaFactoriesHKT {
    readonly factories: PasswordUserFactoryTypes<this['app']>;
}
export declare const passwordAuthPlugin: () => PluginDefinition<'password-auth', {
    readonly factories: PasswordUserFactories;
}>;
