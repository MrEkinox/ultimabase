import type { AppTypes, Empty, ExactShape, FactorySchemaBase, NoRules, NoShape, PluginDefinition, RulesHKT, SchemaFactoriesHKT, SelfArgument, SchemaTarget, ShapeOptionsFor, ShapeOptionsHKT } from './core.ts';
import type { CreateInput, FieldValue, InstanceOf, Item, RelationField, ScalarField, ScalarKeys, SchemaName, Where, WhereBuilder, WhereExpression } from './types.ts';
/** Request context of one row filter. */
export interface AccessFilterContext {
    /** Authenticated user identity, if any. */
    readonly userId: string | null;
}
/** Row filter result: `undefined` = no filter, `false` = no row. */
export type AccessFilterResult<TSchema> = WhereExpression<SchemaName<TSchema>> | Where<TSchema> | false | undefined;
/** `true`/`false`, or a row filter built from the schema's where builder. */
export type AccessRule<TSchema> = boolean | {
    readonly where: (where: WhereBuilder<TSchema>, context: AccessFilterContext) => AccessFilterResult<TSchema>;
};
/** Per-operation access rules of one schema. */
export interface AccessOptions<TSchema> {
    readonly read?: AccessRule<TSchema>;
    readonly create?: boolean;
    readonly update?: AccessRule<TSchema>;
    readonly delete?: AccessRule<TSchema>;
}
export interface AccessRuleOptions<TSchema> {
    /** Row and operation access rules. @example `static access = this.rules.access({ read: true })` */
    readonly access: AccessOptions<TSchema>;
}
export interface AccessRules extends RulesHKT {
    readonly rules: AccessRuleOptions<this['schema']>;
}
export declare const accessPlugin: () => PluginDefinition<"access", AccessRules>;
/** Arguments of a write hook. */
export interface WriteHookArgs<TSchema> {
    readonly item: Item<TSchema>;
    readonly originalItem: Item<TSchema> | null;
}
/** Hooks of one field. */
export interface FieldHooks<TValue> {
    /** Rewrites the input value before validation. */
    readonly resolveInput?: (value: TValue) => TValue;
}
/** Schema and field hooks. */
export interface HooksOptions<TSchema> {
    readonly beforeSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>;
    readonly beforeUpdate?: (args: WriteHookArgs<TSchema>) => void | Promise<void>;
    readonly afterSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>;
    /** Rewrites create input; returns the input to persist. */
    readonly beforeCreate?: (data: CreateInput<TSchema>) => CreateInput<TSchema>;
    /** Field hooks. @example `fields: { title: { resolveInput: (value) => value.trim() } }` */
    readonly fields?: {
        readonly [K in ScalarKeys<TSchema>]?: FieldHooks<FieldValue<TSchema, K>>;
    };
}
export interface HooksRuleOptions<TSchema> {
    /** Schema write hooks and field hooks. @example `static hooks = this.rules.hooks({ beforeSave: ({ item }) => {} })` */
    readonly hooks: HooksOptions<TSchema>;
}
export interface HooksRules extends RulesHKT {
    readonly rules: HooksRuleOptions<this['schema']>;
}
export declare const hooksPlugin: () => PluginDefinition<"hooks", HooksRules>;
type AclPermission = 'read' | 'update' | 'delete';
/** Immutable ACL value. */
export declare class ACL {
    readonly roles: Readonly<Record<string, readonly AclPermission[]>>;
    readonly publicPermissions: readonly AclPermission[];
    constructor(roles?: Readonly<Record<string, readonly AclPermission[]>>, publicPermissions?: readonly AclPermission[]);
    /** Returns a new ACL granting permissions to one role. */
    grantRole(role: string, ...permissions: readonly AclPermission[]): ACL;
    /** Returns a new ACL granting public permissions. */
    grantPublic(...permissions: readonly AclPermission[]): ACL;
}
/** ACL options of one schema. */
export interface AclOptions<TSchema> {
    /** Default ACL computed from the create input. */
    readonly default?: (data: CreateInput<TSchema>) => ACL;
}
export interface AclRuleOptions<TSchema> {
    /** Default ACL. @example `static acl = this.rules.acl({ default: () => new ACL() })` */
    readonly acl: AclOptions<TSchema>;
}
export interface AclRules extends RulesHKT {
    readonly rules: AclRuleOptions<this['schema']>;
}
export declare const aclPlugin: () => PluginDefinition<"acl", AclRules, {
    readonly acl: ScalarField<"json", ACL, false>;
}>;
/** Header option of the soft-delete plugin. */
export interface SoftDeleteOptions {
    /** Adds `isDeleted` and hides deleted rows. @example `{ softDelete: true }` */
    readonly softDelete?: boolean;
}
export interface SoftDeleteShape extends ShapeOptionsHKT {
    readonly options: SoftDeleteOptions;
    readonly added: this['input'] extends {
        readonly softDelete: true;
    } ? {
        readonly isDeleted: ScalarField<'boolean', boolean, true>;
    } : Empty;
}
export declare const softDeletePlugin: () => PluginDefinition<"soft-delete", NoRules, Empty, SoftDeleteShape>;
/** One index over declared fields. */
export interface PostgresIndex<TFields> {
    readonly fields: readonly (keyof TFields & string)[];
    readonly unique?: boolean;
}
/** Header option of the PostgreSQL plugin. */
export interface PostgresOptions<TFields> {
    /** Physical storage. @example `{ postgres: { table: 'todos', indexes: [{ fields: ['archived'] }] } }` */
    readonly postgres?: {
        readonly table?: string;
        readonly indexes?: readonly PostgresIndex<TFields>[];
    };
}
export interface PostgresShape extends ShapeOptionsHKT {
    readonly options: PostgresOptions<this['fields']>;
    readonly added: Empty;
}
export declare const postgresPlugin: (options?: {
    readonly url?: string;
}) => PluginDefinition<"postgres", NoRules, Empty, PostgresShape>;
/** Fields every role schema owns. */
export interface RoleOwnedFields<TMembers> {
    readonly name: ScalarField<'string', string, true>;
    readonly members: RelationField<TMembers, undefined>;
}
/** Static model methods of the role schema. */
export interface RoleStatics {
    /** Adds one user to one role. */
    addMember(role: {
        readonly id: string;
    }, user: {
        readonly id: string;
    }): Promise<void>;
}
/** `App.RoleSchema(className, fields, { members })`: the application's role schema (exactly one). */
export interface RoleSchemaFactory<TApp extends AppTypes> {
    <TSelf = unknown>(...missing: SelfArgument<TSelf>): RoleSchemaHeader<TApp, TSelf>;
}
/** Header of the role schema after `App.RoleSchema<Role>()`. */
export interface RoleSchemaHeader<TApp extends AppTypes, TSelf> {
    <const TName extends string, const TFields, const TMembers extends SchemaTarget>(className: TName, fields: TFields, options: {
        /** Schema of the role members. @example `members: () => User` */
        readonly members: TMembers;
    }): FactorySchemaBase<'RoleSchema', TName, TFields & RoleOwnedFields<TMembers>, Empty, TApp, TSelf, RoleStatics>;
}
export interface RoleFactoryTypes<TApp extends AppTypes> {
    readonly RoleSchema: RoleSchemaFactory<TApp>;
}
export interface RoleFactories extends SchemaFactoriesHKT {
    readonly factories: RoleFactoryTypes<this['app']>;
    readonly required: 'RoleSchema';
}
export declare const rolesPlugin: () => PluginDefinition<"roles", NoRules, Empty, NoShape, RoleFactories>;
/** Fields every password user schema owns. */
export interface PasswordUserOwnedFields {
    readonly username: ScalarField<'string', string, true>;
    readonly email: ScalarField<'string', string, true>;
}
/** Static model methods of the password user schema; inputs typed from the schema itself. */
export interface PasswordUserStatics {
    signUp<TSelf>(this: TSelf, input: CreateInput<TSelf> & {
        readonly password: string;
    }): Promise<InstanceOf<TSelf>>;
    login(username: string, password: string): Promise<{
        readonly sessionToken: string;
    }>;
}
/** `App.PasswordUserSchema(className, fields, shape?)`: the application's user schema (exactly one). */
export interface PasswordUserSchemaFactory<TApp extends AppTypes> {
    <TSelf = unknown>(...missing: SelfArgument<TSelf>): PasswordUserSchemaHeader<TApp, TSelf>;
}
/** Header of the user schema after `App.PasswordUserSchema<User>()`. */
export interface PasswordUserSchemaHeader<TApp extends AppTypes, TSelf> {
    <const TName extends string, const TFields, const TShape extends ShapeOptionsFor<TApp['~shapes'], TFields>>(className: TName, fields: TFields, shape?: TShape & ExactShape<TShape, ShapeOptionsFor<TApp['~shapes'], TFields>>): FactorySchemaBase<'PasswordUserSchema', TName, TFields & PasswordUserOwnedFields, TShape, TApp, TSelf, PasswordUserStatics>;
}
export interface PasswordUserFactoryTypes<TApp extends AppTypes> {
    readonly PasswordUserSchema: PasswordUserSchemaFactory<TApp>;
}
export interface PasswordUserFactories extends SchemaFactoriesHKT {
    readonly factories: PasswordUserFactoryTypes<this['app']>;
    readonly required: 'PasswordUserSchema';
}
export declare const passwordAuthPlugin: () => PluginDefinition<"password-auth", NoRules, Empty, NoShape, PasswordUserFactories>;
export {};
