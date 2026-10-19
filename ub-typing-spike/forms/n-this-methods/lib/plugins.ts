// Form N plugin models (types + tiny runtime): rules are methods typed through `this`. Each plugin only uses Core's generic contracts
// (SchemaOptionsHKT, ShapeMethod, SchemaFactoriesHKT, PluginDefinition, query types); Core
// imports none of them.

import type {
	AppTypes,
	FactorySchema,
	FieldBuilder,
	FieldOptionsHKT,
	NoSchemaFactories,
	NoSchemaOptions,
	LooseRulesOf,
	PluginDefinition,
	SchemaDeclaration,
	SchemaFactoriesHKT,
	SchemaKit,
	SchemaOptionsHKT,
	ShapeOption,
} from './core.ts'
import type {
	CreateInput,
	FieldsOf,
	FieldValue,
	Item,
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

/** `true`/`false`, or a row filter method. @example `read() { return this.where.eq('archived', false) }` */
export type AccessRule<TSchema> = boolean | ((this: AccessFilterContext<TSchema>) => AccessFilterResult<TSchema>)

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

/**
 * Field hooks keyed by field name. NOT usable in form N: inside the generic `define` call,
 * TypeScript gives no contextual type to a member of a mapped type whose keys come from the
 * fields being inferred, so the methods' `this` is untyped (attempts/micro/m5.ts C,
 * attempts/n3-loose-no-register.txt). Form N uses the `resolveInput` field option below.
 */
export type FieldHooks<TSchema> = {
	// Keyed by `keyof FieldsOf` (not `ScalarKeys`): inside the generic `define` call, TypeScript
	// finds no contextual type for a member of a mapped type keyed by a filtered key union, so the
	// methods' `this` was untyped (attempts/single/src/u.ts, attempts/n3-loose-no-register.txt).
	readonly [K in keyof (TSchema & { readonly '~fields': unknown })['~fields']]?: K extends ScalarKeys<TSchema>
		? {
				/** Rewrites one written value. @example `resolveInput() { return this.value.trim() }` */
				readonly resolveInput?: (this: { readonly value: FieldValue<TSchema, K> }) => FieldValue<TSchema, K>
			}
		: never
}

/** Schema-level hooks, as methods. @example `beforeUpdate() { if (this.item.isDeleted) throw ... }` */
export interface HooksOptions<TSchema> {
	readonly beforeSave?: (this: WriteHookArgs<TSchema>) => void | Promise<void>
	readonly beforeUpdate?: (this: WriteHookArgs<TSchema>) => void | Promise<void>
	readonly afterSave?: (this: WriteHookArgs<TSchema>) => void | Promise<void>
	/** Rewrites create input; returns the input to persist. */
	readonly beforeCreate?: (this: { readonly data: CreateInput<TSchema> }) => CreateInput<TSchema>
}

/** Rule contributed by Hooks. */
export interface HooksSchemaOption<TSchema> {
	/** Schema write hooks. @example `hooks: { beforeSave: ({ item }) => {} }` */
	readonly hooks?: HooksOptions<TSchema>
}

export interface HooksSchemaOptions extends SchemaOptionsHKT {
	readonly options: HooksSchemaOption<this['schema']>
}

/** Field options contributed by Hooks (form N). */
export interface HookFieldOptions<TValue> {
	/** Rewrites one written value. @example `displayName: field.string({ resolveInput() { return this.value.trim() } })` */
	readonly resolveInput?: (this: { readonly value: TValue }) => TValue
}

export interface HooksFieldOptions extends FieldOptionsHKT {
	readonly options: HookFieldOptions<this['value']>
}

export const hooksPlugin = (): PluginDefinition<'hooks', HooksSchemaOptions, object, object, NoSchemaFactories, never, HooksFieldOptions> => ({
	id: 'hooks',
	runtime: { ruleKeys: ['hooks'], fieldOptionKeys: ['resolveInput'] },
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
	readonly acl?: { readonly default?: (this: { readonly data: CreateInput<TSchema> }) => ACL }
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

// ---------------------------------------------------------------- soft delete (shape option)

export interface SoftDeleteShapes {
	/** Adds `isDeleted` and hides deleted rows. @example `softDelete: true` */
	readonly softDelete: ShapeOption<{ readonly isDeleted: ScalarField<'boolean', boolean, true> }>
}

export const softDeletePlugin = (): PluginDefinition<'soft-delete', NoSchemaOptions, object, SoftDeleteShapes, NoSchemaFactories, never> => ({
	id: 'soft-delete',
	runtime: { shapeOptions: { softDelete: (field) => ({ isDeleted: field.boolean({ required: true, default: false }) }) } },
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
	define<const TName extends string, const TMembers extends object, const TFields = Readonly<Record<never, never>>>(
		declaration: {
			readonly className: TName
			/** Schema of the role members. @example `members: () => User` */
			readonly members: TMembers
			readonly fields?: (field: FieldBuilder<TApp['~fieldHkts']>) => TFields
		} & LooseRulesOf<TApp, TName, TFields & RoleOwnedFields<TMembers>>,
	): FactorySchema<'RoleSchema', TName, TFields & RoleOwnedFields<TMembers>, TApp, RoleModel>
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
	readonly [rule: string]: unknown
}

export const rolesPlugin = (): PluginDefinition<'roles', NoSchemaOptions, object, object, RoleFactories, 'RoleSchema'> => ({
	id: 'roles',
	runtime: {
		requiredFactories: ['RoleSchema'],
		factories: {
			RoleSchema: (kit: SchemaKit) => ({
				define: ({ members, fields, ...rules }: RuntimeRoleDeclaration) =>
					kit.define({
						...rules,
						className: rules.className,
						factory: 'RoleSchema',
						fields: (field) => ({
							...fields?.(field),
							name: field.string({ required: true }),
							members: field.relation({ target: members }),
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
	signUp<TSelf>(this: TSelf, input: CreateInput<TSelf> & { readonly password: string }): Promise<{ readonly id: string }>
	login(username: string, password: string): Promise<{ readonly sessionToken: string }>
}

/** `App.PasswordUserSchema`: defines the application's user schema. */
export interface PasswordUserSchemaFactory<TApp extends AppTypes> {
	define<const TName extends string, const TFields>(
		declaration: SchemaDeclaration<TName, TFields, TApp['~fieldHkts']> & LooseRulesOf<TApp, TName, TFields & PasswordUserOwnedFields>,
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
	readonly [rule: string]: unknown
}

export const passwordAuthPlugin = (): PluginDefinition<'password-auth', NoSchemaOptions, object, object, PasswordUserFactories, never> => ({
	id: 'password-auth',
	runtime: {
		factories: {
			PasswordUserSchema: (kit: SchemaKit) => ({
				define: ({ fields, ...rules }: RuntimeUserDeclaration) =>
					kit.define({
						...rules,
						className: rules.className,
						factory: 'PasswordUserSchema',
						fields: (field) => ({
							...fields(field),
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
