import type { PluginDefinition, SchemaOptionsHKT } from './core.ts';
import type { CreateInput, Item, ScalarField, SchemaName, Where, WhereBuilder, WhereExpression } from './types.ts';
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
export declare const accessPlugin: () => PluginDefinition<'access', AccessSchemaOptions>;
/** Arguments of a write hook. */
export interface WriteHookArgs<TSchema> {
    readonly item: Item<TSchema>;
    readonly originalItem: Item<TSchema> | null;
}
/** Schema-level hooks. */
export interface HooksOptions<TSchema> {
    readonly beforeSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>;
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
export declare const hooksPlugin: () => PluginDefinition<'hooks', HooksSchemaOptions>;
/** Immutable ACL value. */
export interface ACL {
    readonly '~acl': true;
    grantPublic(...permissions: readonly ('read' | 'update')[]): ACL;
}
/** Schema option contributed by ACL. */
export interface AclSchemaOption<TSchema> {
    /** Default ACL computed from the create input. */
    readonly acl?: {
        readonly default?: (data: CreateInput<TSchema>) => ACL;
    };
}
export interface AclSchemaOptions extends SchemaOptionsHKT {
    readonly options: AclSchemaOption<this['schema']>;
}
export declare const aclPlugin: () => PluginDefinition<'acl', AclSchemaOptions, {
    readonly acl: ScalarField<'json', ACL, true>;
}>;
export interface NoSchemaOptions extends SchemaOptionsHKT {
    readonly options: Readonly<Record<never, never>>;
}
export declare const softDeletePlugin: () => PluginDefinition<'soft-delete', NoSchemaOptions, {
    readonly isDeleted: ScalarField<'boolean', boolean, true>;
}>;
/** Schema option contributed by PostgreSQL. */
export interface PostgresSchemaOption {
    /** Physical storage options. @example `postgres: { table: 'todos' }` */
    readonly postgres?: {
        readonly table?: string;
    };
}
export interface PostgresSchemaOptions extends SchemaOptionsHKT {
    readonly options: PostgresSchemaOption;
}
export declare const postgresPlugin: (options?: {
    readonly url?: string;
}) => PluginDefinition<'postgres', PostgresSchemaOptions>;
