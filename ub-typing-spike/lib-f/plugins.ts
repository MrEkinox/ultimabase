// Section 10, variant F: plugin models contributing chained schema methods.
// Each plugin only uses Core's generic contracts (SchemaMethodsHKT, SchemaMethod,
// PluginDefinition, query types); Core imports none of them.

import type {
	AppTypes,
	FactorySchema,
	FieldBuilder,
	NoSchemaMethods,
	PluginDefinition,
	SchemaDeclaration,
	SchemaFactoriesHKT,
	SchemaMethod,
	SchemaMethodsHKT,
} from './core.ts'
import type { CreateInput, Item, RelationField, ScalarField, ScalarKeys, SchemaName, Where, WhereBuilder, WhereExpression } from './types.ts'

// ---------------------------------------------------------------- access

/** Context received by one row filter. */
export interface AccessFilterContext<TSchema> {
	/** Builder bound to the complete schema. */
	readonly where: WhereBuilder<TSchema>
	/** Authenticated user identity, if any. */
	readonly userId: string | null
}

/** Row filter result: `undefined` = no filter, `false` = no row. */
export type AccessFilterResult<TSchema> = WhereExpression<SchemaName<TSchema>> | Where<TSchema> | false | undefined

/** `true`/`false`, or a row filter. */
export type AccessRule<TSchema> = boolean | { readonly where: (context: AccessFilterContext<TSchema>) => AccessFilterResult<TSchema> }

/** Per-operation access rules of one schema. */
export interface AccessOptions<TSchema> {
	readonly read?: AccessRule<TSchema>
	readonly create?: boolean
	readonly update?: AccessRule<TSchema>
	readonly delete?: AccessRule<TSchema>
}

export interface AccessMethodTypes<TSchema> {
	/** Row and operation access rules. @example `.access({ read: true })` */
	readonly access: SchemaMethod<[options: AccessOptions<TSchema>]>
}

export interface AccessMethods extends SchemaMethodsHKT {
	readonly methods: AccessMethodTypes<this['schema']>
}

export declare const accessPlugin: () => PluginDefinition<'access', AccessMethods>

// ---------------------------------------------------------------- hooks

/** Arguments of a write hook. */
export interface WriteHookArgs<TSchema> {
	readonly item: Item<TSchema>
	readonly originalItem: Item<TSchema> | null
}

/** Schema-level hooks. */
export interface HooksOptions<TSchema> {
	readonly beforeSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>
	readonly afterSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>
	/** Rewrites create input; returns the input to persist. */
	readonly beforeCreate?: (data: CreateInput<TSchema>) => CreateInput<TSchema>
}

export interface HooksMethodTypes<TSchema> {
	/** Schema write hooks. @example `.hooks({ beforeSave: ({ item }) => {} })` */
	readonly hooks: SchemaMethod<[options: HooksOptions<TSchema>]>
}

export interface HooksMethods extends SchemaMethodsHKT {
	readonly methods: HooksMethodTypes<this['schema']>
}

export declare const hooksPlugin: () => PluginDefinition<'hooks', HooksMethods>

// ---------------------------------------------------------------- acl (field on every schema + method)

/** Immutable ACL value. */
export interface ACL {
	readonly '~acl': true
	grantPublic(...permissions: readonly ('read' | 'update')[]): ACL
}

/** ACL options of one schema. */
export interface AclOptions<TSchema> {
	/** Default ACL computed from the create input. */
	readonly default?: (data: CreateInput<TSchema>) => ACL
}

export interface AclMethodTypes<TSchema> {
	/** Default ACL. @example `.acl({ default: () => acl })` */
	readonly acl: SchemaMethod<[options: AclOptions<TSchema>]>
}

export interface AclMethods extends SchemaMethodsHKT {
	readonly methods: AclMethodTypes<this['schema']>
}

export declare const aclPlugin: () => PluginDefinition<'acl', AclMethods, { readonly acl: ScalarField<'json', ACL, true> }>

// ---------------------------------------------------------------- soft delete (shape method)

export interface SoftDeleteMethods extends SchemaMethodsHKT {
	readonly methods: {
		/** Adds `isDeleted` and hides deleted rows. Call it before behaviour methods. @example `.softDelete()` */
		readonly softDelete: SchemaMethod<[], { readonly isDeleted: ScalarField<'boolean', boolean, true> }>
	}
}

export declare const softDeletePlugin: () => PluginDefinition<'soft-delete', SoftDeleteMethods>

// ---------------------------------------------------------------- postgres (two methods)

/** One index over scalar fields. */
export interface IndexDefinition<TSchema> {
	readonly fields: readonly ScalarKeys<TSchema>[]
	readonly unique?: boolean
}

export interface PostgresMethodTypes<TSchema> {
	/** Physical storage options. @example `.postgres({ table: 'todos' })` */
	readonly postgres: SchemaMethod<[options: { readonly table?: string }]>
	/** Database indexes. @example `.indexes([{ fields: ['completed'] }])` */
	readonly indexes: SchemaMethod<[indexes: readonly IndexDefinition<TSchema>[]]>
}

export interface PostgresMethods extends SchemaMethodsHKT {
	readonly methods: PostgresMethodTypes<this['schema']>
}

export declare const postgresPlugin: (options?: { readonly url?: string }) => PluginDefinition<'postgres', PostgresMethods>

// ---------------------------------------------------------------- roles (schema factory)

/** Fields every role schema owns. */
export interface RoleOwnedFields<TMembers> {
	readonly name: ScalarField<'string', string, true>
	readonly members: RelationField<TMembers, undefined>
}

/** Model methods of the role schema. */
export interface RoleModel {
	/** Adds one user to one role. */
	addMember(role: { readonly id: string }, user: { readonly id: string }): Promise<void>
}

/** `App.RoleSchema`: defines the application's role schema. */
export interface RoleSchemaFactory<TApp extends AppTypes> {
	define<const TName extends string, const TMembers extends object, const TFields = Readonly<Record<never, never>>>(declaration: {
		readonly className: TName
		/** Schema of the role members. @example `members: () => User` */
		readonly members: TMembers
		readonly fields?: (field: FieldBuilder) => TFields
	}): FactorySchema<'RoleSchema', TName, TFields & RoleOwnedFields<TMembers>, TApp, RoleModel>
}

export interface RoleFactoryTypes<TApp extends AppTypes> {
	readonly RoleSchema: RoleSchemaFactory<TApp>
}

export interface RoleFactories extends SchemaFactoriesHKT {
	readonly factories: RoleFactoryTypes<this['app']>
}

export declare const rolesPlugin: () => PluginDefinition<'roles', NoSchemaMethods, object, RoleFactories>

// ---------------------------------------------------------------- password authentication (schema factory)

/** Fields every password user schema owns. */
export interface PasswordUserOwnedFields {
	readonly username: ScalarField<'string', string, true>
	readonly email: ScalarField<'string', string, true>
}

/** Model methods of the password user schema; inputs typed from the schema itself. */
export interface PasswordUserModel {
	signUp<TSelf>(this: TSelf, input: CreateInput<TSelf> & { readonly password: string }): Promise<{ readonly id: string }>
	login(username: string, password: string): Promise<{ readonly sessionToken: string }>
}

/** `App.PasswordUserSchema`: defines the application's user schema. */
export interface PasswordUserSchemaFactory<TApp extends AppTypes> {
	define<const TName extends string, const TFields>(
		declaration: SchemaDeclaration<TName, TFields>,
	): FactorySchema<'PasswordUserSchema', TName, TFields & PasswordUserOwnedFields, TApp, PasswordUserModel>
}

export interface PasswordUserFactoryTypes<TApp extends AppTypes> {
	readonly PasswordUserSchema: PasswordUserSchemaFactory<TApp>
}

export interface PasswordUserFactories extends SchemaFactoriesHKT {
	readonly factories: PasswordUserFactoryTypes<this['app']>
}

export declare const passwordAuthPlugin: () => PluginDefinition<'password-auth', NoSchemaMethods, object, PasswordUserFactories>
