import type { PluginDefinition, SchemaMethod, SchemaMethodsHKT } from './core.ts';
import type { CreateInput, Item, ScalarField, ScalarKeys, SchemaName, Where, WhereBuilder, WhereExpression } from './types.ts';
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
export interface AccessMethodTypes<TSchema> {
    /** Row and operation access rules. @example `.access({ read: true })` */
    readonly access: SchemaMethod<[options: AccessOptions<TSchema>]>;
}
export interface AccessMethods extends SchemaMethodsHKT {
    readonly methods: AccessMethodTypes<this['schema']>;
}
export declare const accessPlugin: () => PluginDefinition<'access', AccessMethods>;
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
export interface HooksMethodTypes<TSchema> {
    /** Schema write hooks. @example `.hooks({ beforeSave: ({ item }) => {} })` */
    readonly hooks: SchemaMethod<[options: HooksOptions<TSchema>]>;
}
export interface HooksMethods extends SchemaMethodsHKT {
    readonly methods: HooksMethodTypes<this['schema']>;
}
export declare const hooksPlugin: () => PluginDefinition<'hooks', HooksMethods>;
/** Immutable ACL value. */
export interface ACL {
    readonly '~acl': true;
    grantPublic(...permissions: readonly ('read' | 'update')[]): ACL;
}
/** ACL options of one schema. */
export interface AclOptions<TSchema> {
    /** Default ACL computed from the create input. */
    readonly default?: (data: CreateInput<TSchema>) => ACL;
}
export interface AclMethodTypes<TSchema> {
    /** Default ACL. @example `.acl({ default: () => acl })` */
    readonly acl: SchemaMethod<[options: AclOptions<TSchema>]>;
}
export interface AclMethods extends SchemaMethodsHKT {
    readonly methods: AclMethodTypes<this['schema']>;
}
export declare const aclPlugin: () => PluginDefinition<'acl', AclMethods, {
    readonly acl: ScalarField<'json', ACL, true>;
}>;
export interface SoftDeleteMethods extends SchemaMethodsHKT {
    readonly methods: {
        /** Adds `isDeleted` and hides deleted rows. Call it before behaviour methods. @example `.softDelete()` */
        readonly softDelete: SchemaMethod<[], {
            readonly isDeleted: ScalarField<'boolean', boolean, true>;
        }>;
    };
}
export declare const softDeletePlugin: () => PluginDefinition<'soft-delete', SoftDeleteMethods>;
/** One index over scalar fields. */
export interface IndexDefinition<TSchema> {
    readonly fields: readonly ScalarKeys<TSchema>[];
    readonly unique?: boolean;
}
export interface PostgresMethodTypes<TSchema> {
    /** Physical storage options. @example `.postgres({ table: 'todos' })` */
    readonly postgres: SchemaMethod<[options: {
        readonly table?: string;
    }]>;
    /** Database indexes. @example `.indexes([{ fields: ['completed'] }])` */
    readonly indexes: SchemaMethod<[indexes: readonly IndexDefinition<TSchema>[]]>;
}
export interface PostgresMethods extends SchemaMethodsHKT {
    readonly methods: PostgresMethodTypes<this['schema']>;
}
export declare const postgresPlugin: (options?: {
    readonly url?: string;
}) => PluginDefinition<'postgres', PostgresMethods>;
