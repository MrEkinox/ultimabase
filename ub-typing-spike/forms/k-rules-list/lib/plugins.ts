// Plugins of form K, written against Core's generic slots only (Core imports none).
// Each plugin value is its runtime part; its type contributions are a phantom member.

import type {
	AppTypes,
	FactorySchema,
	FieldBuilder,
	PluginDefinition,
	SchemaDeclaration,
	SchemaFactoriesHKT,
	SchemaRulesHKT,
	SchemaShapeHKT,
} from './core.ts'
import type { RuntimeFieldBuilder } from './runtime.ts'
import type { CreateInput, Item, RelationField, ScalarField, ScalarKeys, SchemaName, Where, WhereBuilder, WhereExpression } from './types.ts'

// ---------------------------------------------------------------- access (rule entry)

/** Context received by one row filter. */
export interface AccessFilterContext<TSchema> {
	/** Builder bound to the complete schema. */
	readonly where: WhereBuilder<TSchema>
	/** Authenticated user id (filters run for authenticated requests only). */
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

export interface AccessRuleTypes<TSchema> {
	/** Row and operation access rules. @example `access: { read: true }` */
	readonly access?: AccessOptions<TSchema>
}

export interface AccessRules extends SchemaRulesHKT {
	readonly rules: AccessRuleTypes<this['schema']>
}

export const accessPlugin = (): PluginDefinition<'access', { readonly rules: AccessRules }> => ({ id: 'access', ruleKeys: ['access'] })

// ---------------------------------------------------------------- hooks (rule entry)

/** Arguments of a write hook. */
export interface WriteHookArgs<TSchema> {
	readonly item: Item<TSchema>
	readonly originalItem: Item<TSchema> | null
}

/** Schema-level hooks. */
export interface HooksOptions<TSchema> {
	readonly beforeSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>
	readonly beforeUpdate?: (args: WriteHookArgs<TSchema>) => void | Promise<void>
	readonly afterSave?: (args: WriteHookArgs<TSchema>) => void | Promise<void>
	/** Rewrites create input; returns the input to persist. */
	readonly beforeCreate?: (data: CreateInput<TSchema>) => CreateInput<TSchema>
}

export interface HooksRuleTypes<TSchema> {
	/** Schema write hooks. @example `hooks: { beforeSave: ({ item }) => {} }` */
	readonly hooks?: HooksOptions<TSchema>
}

export interface HooksRules extends SchemaRulesHKT {
	readonly rules: HooksRuleTypes<this['schema']>
}

export const hooksPlugin = (): PluginDefinition<'hooks', { readonly rules: HooksRules }> => ({ id: 'hooks', ruleKeys: ['hooks'] })

// ---------------------------------------------------------------- acl (field on every schema + rule entry)

/** Immutable ACL value. */
export interface ACL {
	readonly '~acl': true
	grantPublic(...permissions: readonly ('read' | 'update')[]): ACL
	grantRole(role: string, ...permissions: readonly ('read' | 'update' | 'delete')[]): ACL
}

/** ACL options of one schema. */
export interface AclOptions<TSchema> {
	/** Default ACL computed from the create input. */
	readonly default?: (data: CreateInput<TSchema>) => ACL
}

export interface AclRuleTypes<TSchema> {
	/** Default ACL. @example `acl: { default: () => acl }` */
	readonly acl?: AclOptions<TSchema>
}

export interface AclRules extends SchemaRulesHKT {
	readonly rules: AclRuleTypes<this['schema']>
}

export interface AclFields {
	readonly acl: ScalarField<'json', ACL, true>
}

export const aclPlugin = (): PluginDefinition<'acl', { readonly rules: AclRules; readonly fields: AclFields }> => ({
	id: 'acl',
	ruleKeys: ['acl'],
	fields: (field: RuntimeFieldBuilder) => ({ acl: field['json']?.({ required: true }) ?? { kind: 'json', options: {} } }),
})

// ---------------------------------------------------------------- soft delete (shape option)

export interface SoftDeleteFields {
	readonly isDeleted: ScalarField<'boolean', boolean, true>
}

export interface SoftDeleteShape extends SchemaShapeHKT {
	readonly options: {
		/** Adds `isDeleted` and hides deleted rows. @example `softDelete: true` */
		readonly softDelete?: boolean
	}
	readonly fields: this['declaration'] extends { readonly softDelete: true } ? SoftDeleteFields : Readonly<Record<never, never>>
}

export const softDeletePlugin = (): PluginDefinition<'soft-delete', { readonly shape: SoftDeleteShape }> => ({
	id: 'soft-delete',
	shapeOptions: ['softDelete'],
	shapeFields: (declaration, field) =>
		declaration['softDelete'] === true ? { isDeleted: field['boolean']?.({ required: true, default: false }) ?? { kind: 'boolean', options: {} } } : {},
})

// ---------------------------------------------------------------- postgres (rule entry)

/** One index over scalar fields. */
export interface IndexDefinition<TSchema> {
	readonly fields: readonly ScalarKeys<TSchema>[]
	readonly unique?: boolean
}

export interface PostgresRuleTypes<TSchema> {
	/** Physical storage. @example `postgres: { table: 'todos', indexes: [{ fields: ['title'] }] }` */
	readonly postgres?: { readonly table?: string; readonly indexes?: readonly IndexDefinition<TSchema>[] }
}

export interface PostgresRules extends SchemaRulesHKT {
	readonly rules: PostgresRuleTypes<this['schema']>
}

export const postgresPlugin = (options?: { readonly url?: string }): PluginDefinition<'postgres', { readonly rules: PostgresRules }> => ({
	id: 'postgres',
	ruleKeys: ['postgres'],
})

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

/** `App.RoleSchema`: defines the application's role schema (exactly one per application). */
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

export const rolesPlugin = (): PluginDefinition<'roles', { readonly factories: RoleFactories }> => ({
	id: 'roles',
	factories: {
		RoleSchema: {
			cardinality: 'one',
			prepare: ({ members, ...declaration }) => ({
				declaration,
				ownedFields: (field) => ({
					name: field['string']?.({ required: true }) ?? { kind: 'string', options: {} },
					members: field['relation']?.({ target: members }) ?? { kind: 'relation', options: {} },
				}),
				model: { addMember: async () => undefined },
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
	signUp<TSelf>(this: TSelf, input: CreateInput<TSelf> & { readonly password: string }): Promise<{ readonly id: string }>
	login(username: string, password: string): Promise<{ readonly sessionToken: string }>
}

/** `App.PasswordUserSchema`: defines the application's user schema (exactly one per application). */
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

export const passwordAuthPlugin = (): PluginDefinition<'password-auth', { readonly factories: PasswordUserFactories }> => ({
	id: 'password-auth',
	factories: {
		PasswordUserSchema: {
			cardinality: 'one',
			prepare: (declaration) => ({
				declaration,
				ownedFields: (field) => ({
					username: field['string']?.({ required: true }) ?? { kind: 'string', options: {} },
					email: field['string']?.({ required: true }) ?? { kind: 'string', options: {} },
				}),
				model: { signUp: async () => ({ id: 'u1' }), login: async () => ({ sessionToken: 't' }) },
			}),
		},
	},
})
