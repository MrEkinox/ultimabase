// Form G plugin models. Each plugin uses only Core's generic slots (RulesHKT,
// ShapeOptionsHKT, SchemaFactoriesHKT, PluginDefinition, query types); Core imports none.

import type {
	AppTypes,
	Empty,
	ExactShape,
	FactorySchemaBase,
	NoRules,
	NoShape,
	PluginDefinition,
	RulesHKT,
	SchemaFactoriesHKT,
	SchemaTarget,
	ShapeOptionsFor,
	ShapeOptionsHKT,
	FactoryKit,
} from './core.ts'
import type { CreateInput, FieldValue, InstanceOf, Item, RelationField, ScalarField, ScalarKeys, SchemaName, Where, WhereBuilder, WhereExpression } from './types.ts'

// ---------------------------------------------------------------- access (rule)

/** Request context of one row filter. */
export interface AccessFilterContext {
	/** Authenticated user identity, if any. */
	readonly userId: string | null
}

/** Row filter result: `undefined` = no filter, `false` = no row. */
export type AccessFilterResult<TSchema> = WhereExpression<SchemaName<TSchema>> | Where<TSchema> | false | undefined

/** `true`/`false`, or a row filter built from the schema's where builder. */
export type AccessRule<TSchema> =
	| boolean
	| { readonly where: (where: WhereBuilder<TSchema>, context: AccessFilterContext) => AccessFilterResult<TSchema> }

/** Per-operation access rules of one schema. */
export interface AccessOptions<TSchema> {
	readonly read?: AccessRule<TSchema>
	readonly create?: boolean
	readonly update?: AccessRule<TSchema>
	readonly delete?: AccessRule<TSchema>
}

export interface AccessRuleOptions<TSchema> {
	/** Row and operation access rules. @example `static access = this.rules.access({ read: true })` */
	readonly access: AccessOptions<TSchema>
}

export interface AccessRules extends RulesHKT {
	readonly rules: AccessRuleOptions<this['schema']>
}

export const accessPlugin = (): PluginDefinition<'access', AccessRules> => ({ id: 'access', runtime: { rules: ['access'] } })

// ---------------------------------------------------------------- hooks (rule)

/** Arguments of a write hook. */
export interface WriteHookArgs<TSchema> {
	readonly item: Item<TSchema>
	readonly originalItem: Item<TSchema> | null
}

/** Hooks of one field. */
export interface FieldHooks<TValue> {
	/** Rewrites the input value before validation. */
	readonly resolveInput?: (value: TValue) => TValue
}

/** Schema and field hooks. */
export interface HooksOptions<TSchema> {
	readonly beforeSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>
	readonly beforeUpdate?: (args: WriteHookArgs<TSchema>) => void | Promise<void>
	readonly afterSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>
	/** Rewrites create input; returns the input to persist. */
	readonly beforeCreate?: (data: CreateInput<TSchema>) => CreateInput<TSchema>
	/** Field hooks. @example `fields: { title: { resolveInput: (value) => value.trim() } }` */
	readonly fields?: { readonly [K in ScalarKeys<TSchema>]?: FieldHooks<FieldValue<TSchema, K>> }
}

export interface HooksRuleOptions<TSchema> {
	/** Schema write hooks and field hooks. @example `static hooks = this.rules.hooks({ beforeSave: ({ item }) => {} })` */
	readonly hooks: HooksOptions<TSchema>
}

export interface HooksRules extends RulesHKT {
	readonly rules: HooksRuleOptions<this['schema']>
}

export const hooksPlugin = (): PluginDefinition<'hooks', HooksRules> => ({ id: 'hooks', runtime: { rules: ['hooks'] } })

// ---------------------------------------------------------------- acl (rule + field on every schema)

type AclPermission = 'read' | 'update' | 'delete'

/** Immutable ACL value. */
export class ACL {
	readonly roles: Readonly<Record<string, readonly AclPermission[]>>
	readonly publicPermissions: readonly AclPermission[]
	constructor(roles: Readonly<Record<string, readonly AclPermission[]>> = {}, publicPermissions: readonly AclPermission[] = []) {
		this.roles = Object.freeze({ ...roles })
		this.publicPermissions = Object.freeze([...publicPermissions])
		Object.freeze(this)
	}
	/** Returns a new ACL granting permissions to one role. */
	grantRole(role: string, ...permissions: readonly AclPermission[]): ACL {
		return new ACL(Object.fromEntries([...Object.entries(this.roles), [role, permissions]]), this.publicPermissions)
	}
	/** Returns a new ACL granting public permissions. */
	grantPublic(...permissions: readonly AclPermission[]): ACL {
		return new ACL(this.roles, permissions)
	}
}

/** ACL options of one schema. */
export interface AclOptions<TSchema> {
	/** Default ACL computed from the create input. */
	readonly default?: (data: CreateInput<TSchema>) => ACL
}

export interface AclRuleOptions<TSchema> {
	/** Default ACL. @example `static acl = this.rules.acl({ default: () => new ACL() })` */
	readonly acl: AclOptions<TSchema>
}

export interface AclRules extends RulesHKT {
	readonly rules: AclRuleOptions<this['schema']>
}

export const aclPlugin = (): PluginDefinition<'acl', AclRules, { readonly acl: ScalarField<'json', ACL, false> }> => ({
	id: 'acl',
	runtime: { rules: ['acl'], fields: { acl: { kind: 'json' } } },
})

// ---------------------------------------------------------------- soft delete (shape option adding a field)

/** Header option of the soft-delete plugin. */
export interface SoftDeleteOptions {
	/** Adds `isDeleted` and hides deleted rows. @example `{ softDelete: true }` */
	readonly softDelete?: boolean
}

export interface SoftDeleteShape extends ShapeOptionsHKT {
	readonly options: SoftDeleteOptions
	readonly added: this['input'] extends { readonly softDelete: true } ? { readonly isDeleted: ScalarField<'boolean', boolean, true> } : Empty
}

export const softDeletePlugin = (): PluginDefinition<'soft-delete', NoRules, Empty, SoftDeleteShape> => ({
	id: 'soft-delete',
	runtime: { shapeOptions: ['softDelete'], shapeFields: (shape) => (shape['softDelete'] === true ? { isDeleted: { kind: 'boolean' } } : {}) },
})

// ---------------------------------------------------------------- postgres (shape option, keys typed by the header)

/** One index over declared fields. */
export interface PostgresIndex<TFields> {
	readonly fields: readonly (keyof TFields & string)[]
	readonly unique?: boolean
}

/** Header option of the PostgreSQL plugin. */
export interface PostgresOptions<TFields> {
	/** Physical storage. @example `{ postgres: { table: 'todos', indexes: [{ fields: ['archived'] }] } }` */
	readonly postgres?: { readonly table?: string; readonly indexes?: readonly PostgresIndex<TFields>[] }
}

export interface PostgresShape extends ShapeOptionsHKT {
	readonly options: PostgresOptions<this['fields']>
	readonly added: Empty
}

export const postgresPlugin = (options?: { readonly url?: string }): PluginDefinition<'postgres', NoRules, Empty, PostgresShape> => ({
	id: 'postgres',
	runtime: { shapeOptions: ['postgres'] },
})

// ---------------------------------------------------------------- roles (schema factory)

/** Fields every role schema owns. */
export interface RoleOwnedFields<TMembers> {
	readonly name: ScalarField<'string', string, true>
	readonly members: RelationField<TMembers, undefined>
}

/** Static model methods of the role schema. */
export interface RoleStatics {
	/** Adds one user to one role. */
	addMember(role: { readonly id: string }, user: { readonly id: string }): Promise<void>
}

/** `App.RoleSchema(className, fields, { members })`: the application's role schema (exactly one). */
export interface RoleSchemaFactory<TApp extends AppTypes> {
	<const TName extends string, const TFields, const TMembers extends SchemaTarget>(
		className: TName,
		fields: TFields,
		options: {
			/** Schema of the role members. @example `members: () => User` */
			readonly members: TMembers
		},
	): FactorySchemaBase<'RoleSchema', TName, TFields & RoleOwnedFields<TMembers>, Empty, TApp, RoleStatics>
}

export interface RoleFactoryTypes<TApp extends AppTypes> {
	readonly RoleSchema: RoleSchemaFactory<TApp>
}

export interface RoleFactories extends SchemaFactoriesHKT {
	readonly factories: RoleFactoryTypes<this['app']>
	readonly required: 'RoleSchema'
}

export const rolesPlugin = (): PluginDefinition<'roles', NoRules, Empty, NoShape, RoleFactories> => ({
	id: 'roles',
	runtime: {
		requiredFactories: ['RoleSchema'],
		factories: {
			RoleSchema:
				(kit: FactoryKit) =>
				(className: string, fields: Readonly<Record<string, unknown>>, options: { readonly members: object }): unknown =>
					kit.createBase(
						className,
						fields,
						{},
						{ id: 'RoleSchema', statics: { addMember: async (): Promise<void> => {} } },
						{
							name: kit.field.string({ required: true }),
							// Read lazily: `members` may be a getter returning a class not initialized yet.
							get members(): unknown {
								return kit.field.relation(options.members)
							},
						},
					),
		},
	},
})

// ---------------------------------------------------------------- password authentication (schema factory)

/** Fields every password user schema owns. */
export interface PasswordUserOwnedFields {
	readonly username: ScalarField<'string', string, true>
	readonly email: ScalarField<'string', string, true>
}

/** Static model methods of the password user schema; inputs typed from the schema itself. */
export interface PasswordUserStatics {
	signUp<TSelf>(this: TSelf, input: CreateInput<TSelf> & { readonly password: string }): Promise<InstanceOf<TSelf>>
	login(username: string, password: string): Promise<{ readonly sessionToken: string }>
}

/** `App.PasswordUserSchema(className, fields, shape?)`: the application's user schema (exactly one). */
export interface PasswordUserSchemaFactory<TApp extends AppTypes> {
	<const TName extends string, const TFields, const TShape extends ShapeOptionsFor<TApp['~shapes'], TFields>>(
		className: TName,
		fields: TFields,
		shape?: TShape & ExactShape<TShape, ShapeOptionsFor<TApp['~shapes'], TFields>>,
	): FactorySchemaBase<'PasswordUserSchema', TName, TFields & PasswordUserOwnedFields, TShape, TApp, PasswordUserStatics>
}

export interface PasswordUserFactoryTypes<TApp extends AppTypes> {
	readonly PasswordUserSchema: PasswordUserSchemaFactory<TApp>
}

export interface PasswordUserFactories extends SchemaFactoriesHKT {
	readonly factories: PasswordUserFactoryTypes<this['app']>
	readonly required: 'PasswordUserSchema'
}

export const passwordAuthPlugin = (): PluginDefinition<'password-auth', NoRules, Empty, NoShape, PasswordUserFactories> => ({
	id: 'password-auth',
	runtime: {
		requiredFactories: ['PasswordUserSchema'],
		factories: {
			PasswordUserSchema:
				(kit: FactoryKit) =>
				(className: string, fields: Readonly<Record<string, unknown>>, shape?: Readonly<Record<string, unknown>>): unknown =>
					kit.createBase(
						className,
						fields,
						shape ?? {},
						{
							id: 'PasswordUserSchema',
							statics: {
								signUp: async (): Promise<unknown> => ({}),
								login: async (): Promise<{ readonly sessionToken: string }> => ({ sessionToken: 'stub' }),
							},
						},
						{ username: kit.field.string({ required: true }), email: kit.field.string({ required: true }) },
					),
		},
	},
})
