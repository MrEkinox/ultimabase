// Form D plugin models (types + tiny runtime). Each plugin only uses Core's generic contracts
// (SchemaOptionsHKT, ShapeMethod, SchemaFactoriesHKT, PluginDefinition, query types); Core
// imports none of them.

import type {
	AppTypes,
	CreateInput as PublicCreateInput,
	FactorySchema,
	FieldBuilder,
	NoSchemaFactories,
	NoSchemaOptions,
	PluginDefinition,
	SchemaDeclaration,
	SchemaFactoriesHKT,
	SchemaKit,
	SchemaOptionsHKT,
	ShapeMethod,
} from './core.ts'
import type {
	CreateInput,
	FieldValue,
	Model as Item,
	RelationField,
	ScalarField,
	ScalarKeys,
	SchemaName,
	Where,
	WhereBuilder,
	WhereExpression,
} from './types.ts'

// ---------------------------------------------------------------- access

/** Context received by one row filter (filters run for authenticated requests). */
export interface AccessFilterContext<TSchema> {
	/** Builder bound to the complete schema. */
	readonly where: WhereBuilder<TSchema>
	/** Authenticated user identity. */
	readonly userId: string
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

/** Rule contributed by Access. */
export interface AccessSchemaOption<TSchema> {
	/** Row and operation access rules. @example `access: { read: true }` */
	readonly access?: AccessOptions<TSchema>
}

export interface AccessSchemaOptions extends SchemaOptionsHKT {
	readonly options: AccessSchemaOption<this['schema']>
}

export const accessPlugin = (): PluginDefinition<'access', AccessSchemaOptions, object, object, NoSchemaFactories, never> => ({
	id: 'access',
	runtime: { ruleKeys: ['access'] },
})

// ---------------------------------------------------------------- hooks

/** Arguments of a write hook. */
export interface WriteHookArgs<TSchema> {
	readonly item: Item<TSchema>
	readonly originalItem: Item<TSchema> | null
}

/** Field hooks, keyed by scalar field. */
export type FieldHooks<TSchema> = {
	readonly [K in ScalarKeys<TSchema>]?: {
		/** Rewrites one written value. @example `resolveInput: ({ value }) => value.trim()` */
		readonly resolveInput?: (args: { readonly value: FieldValue<TSchema, K> }) => FieldValue<TSchema, K>
	}
}

/** Schema-level hooks. */
export interface HooksOptions<TSchema> {
	readonly beforeSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>
	readonly beforeUpdate?: (args: WriteHookArgs<TSchema>) => void | Promise<void>
	readonly afterSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>
	/** Rewrites create input; returns the input to persist. */
	readonly beforeCreate?: (data: CreateInput<TSchema>) => CreateInput<TSchema>
	readonly fields?: FieldHooks<TSchema>
}

/** Rule contributed by Hooks. */
export interface HooksSchemaOption<TSchema> {
	/** Schema write hooks. @example `hooks: { beforeSave: ({ item }) => {} }` */
	readonly hooks?: HooksOptions<TSchema>
}

export interface HooksSchemaOptions extends SchemaOptionsHKT {
	readonly options: HooksSchemaOption<this['schema']>
}

export const hooksPlugin = (): PluginDefinition<'hooks', HooksSchemaOptions, object, object, NoSchemaFactories, never> => ({
	id: 'hooks',
	runtime: { ruleKeys: ['hooks'] },
})

// ---------------------------------------------------------------- acl (field on every schema + rule)

type Permission = 'read' | 'update' | 'delete'

/** Immutable ACL value (no persistence method). */
export class ACL {
	readonly entries: ReadonlyMap<string, readonly Permission[]>
	private constructor(entries: ReadonlyMap<string, readonly Permission[]>) {
		this.entries = entries
	}
	/** ACL granting nothing. */
	static none(): ACL {
		return new ACL(new Map())
	}
	grantPublic(...permissions: readonly Permission[]): ACL {
		return new ACL(new Map([...this.entries, ['*', permissions]]))
	}
	grantRole(role: string, ...permissions: readonly Permission[]): ACL {
		return new ACL(new Map([...this.entries, [`role:${role}`, permissions]]))
	}
}

/** Rule contributed by ACL. */
export interface AclSchemaOption<TSchema> {
	/** Default ACL computed from the create input. */
	readonly acl?: { readonly default?: (data: CreateInput<TSchema>) => ACL }
}

export interface AclSchemaOptions extends SchemaOptionsHKT {
	readonly options: AclSchemaOption<this['schema']>
}

export const aclPlugin = (): PluginDefinition<
	'acl',
	AclSchemaOptions,
	{ readonly acl: ScalarField<'json', ACL, true> },
	object,
	NoSchemaFactories,
	never
> => ({
	id: 'acl',
	runtime: { ruleKeys: ['acl'], fields: (field: FieldBuilder) => ({ acl: field.string({ required: true }) }) },
})

// ---------------------------------------------------------------- soft delete (shape method)

export interface SoftDeleteShapes {
	/** Adds `isDeleted` and hides deleted rows. Call it before `.with(...)`. @example `.softDelete()` */
	readonly softDelete: ShapeMethod<[], { readonly isDeleted: ScalarField<'boolean', boolean, true> }>
}

export const softDeletePlugin = (): PluginDefinition<'soft-delete', NoSchemaOptions, object, SoftDeleteShapes, NoSchemaFactories, never> => ({
	id: 'soft-delete',
	runtime: { shapeMethods: { softDelete: (field) => ({ isDeleted: field.boolean({ required: true, default: false }) }) } },
})

// ---------------------------------------------------------------- postgres (schema-dependent rule: indexes)

/** One index over scalar fields. */
export interface IndexDefinition<TSchema> {
	readonly fields: readonly ScalarKeys<TSchema>[]
	readonly unique?: boolean
}

/** Rule contributed by PostgreSQL. */
export interface PostgresSchemaOption<TSchema> {
	/** Physical storage options. @example `postgres: { table: 'todos' }` */
	readonly postgres?: { readonly table?: string; readonly indexes?: readonly IndexDefinition<TSchema>[] }
}

export interface PostgresSchemaOptions extends SchemaOptionsHKT {
	readonly options: PostgresSchemaOption<this['schema']>
}

export const postgresPlugin = (options?: {
	readonly url?: string
}): PluginDefinition<'postgres', PostgresSchemaOptions, object, object, NoSchemaFactories, never> => ({
	id: 'postgres',
	runtime: { ruleKeys: ['postgres'] },
})

// ---------------------------------------------------------------- roles (schema factory, exactly one)

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

interface RuntimeRoleDeclaration {
	readonly className: string
	readonly members: object
	readonly fields?: (field: FieldBuilder) => object
}

export const rolesPlugin = (): PluginDefinition<'roles', NoSchemaOptions, object, object, RoleFactories, 'RoleSchema'> => ({
	id: 'roles',
	runtime: {
		requiredFactories: ['RoleSchema'],
		factories: {
			RoleSchema: (kit: SchemaKit) => ({
				define: (declaration: RuntimeRoleDeclaration) =>
					kit.define({
						className: declaration.className,
						factory: 'RoleSchema',
						fields: (field) => ({
							...declaration.fields?.(field),
							name: field.string({ required: true }),
							members: field.relation({ target: declaration.members }),
						}),
						model: { addMember: async () => {} },
					}),
			}),
		},
	},
})

// ---------------------------------------------------------------- password authentication (schema factory)

/** Fields every password user schema owns. */
export interface PasswordUserOwnedFields {
	readonly username: ScalarField<'string', string, true>
	readonly email: ScalarField<'string', string, true>
}

/** Model methods of the password user schema; inputs typed from the schema itself. */
export interface PasswordUserModel {
	signUp<TSelf>(this: TSelf, input: PublicCreateInput<TSelf> & { readonly password: string }): Promise<{ readonly id: string }>
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

interface RuntimeUserDeclaration {
	readonly className: string
	readonly fields: (field: FieldBuilder) => object
}

export const passwordAuthPlugin = (): PluginDefinition<'password-auth', NoSchemaOptions, object, object, PasswordUserFactories, never> => ({
	id: 'password-auth',
	runtime: {
		factories: {
			PasswordUserSchema: (kit: SchemaKit) => ({
				define: (declaration: RuntimeUserDeclaration) =>
					kit.define({
						className: declaration.className,
						factory: 'PasswordUserSchema',
						fields: (field) => ({
							...declaration.fields(field),
							username: field.string({ required: true }),
							email: field.string({ required: true }),
						}),
						model: {
							signUp: async () => ({ id: 'new-user' }),
							login: async () => ({ sessionToken: 'session' }),
						},
					}),
			}),
		},
	},
})
