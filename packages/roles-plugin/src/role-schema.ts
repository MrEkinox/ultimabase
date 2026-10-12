import {
	type Pointer,
	Schema,
	relationField,
	stringField,
	type ConfiguredFieldDeclaration,
	type DeclaredSchema,
	type DeferredSchemaTarget,
	type RelationField,
	type RequestSubjectContext,
	type ScalarFieldTypeState,
	type SchemaDefinition,
	type SchemaFields,
	type SchemaRef,
	type StringField,
} from '@ultimabase/core'
import type {
	DeclaredSchemaShape,
	PluginSourceState,
	SchemaFactoriesHKT,
	SchemaFactoryContext,
	SchemaFactoryShape,
	SchemaStaticsHKT,
} from '@ultimabase/core/plugin'
import {
	immutableArray,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	createRoleReference,
	normalizeRoleName,
	type RoleIdSelector,
	type RoleNameSelector,
	type RoleReference,
} from './role-reference.js'
import {
	createRoleSchemaIdentity,
	roleSchemaIdentityOptionName,
} from './role-schema-identity.js'

/** Identifies the option-light official provider owning role schema behavior. */
export const rolesPluginId = '@ultimabase/roles-plugin' as const

const createRoleNameField = (): StringField<
	ScalarFieldTypeState<true, false, false, false>
> =>
	stringField({
		indexed: 'unique',
		required: true,
	})

type RoleNameField = ReturnType<typeof createRoleNameField>

/** Names fields reserved for portable role semantics. */
export type ReservedRoleFieldName = 'includedRoles' | 'members' | 'name'

const reservedRoleFieldNames: readonly ReservedRoleFieldName[] = [
	'includedRoles',
	'members',
	'name',
]

/** Resolves the current request member without coupling roles to authentication. */
export interface RoleCurrentMemberInput {
	readonly context: RequestSubjectContext
}

/** Selects how one role deletion treats references owned outside its schema. */
export type RoleReferenceDeletionPolicy = 'cascade' | 'fail' | 'preserve'

/** The fields the factory adds to every role schema. */
export interface RoleOwnedFields<TClassName extends string, TMembers> {
	/** Stores the canonical locale-independent role identity. */
	readonly name: RoleNameField
	/** Stores direct members from the declared member schema. */
	readonly members: RelationField<DeferredSchemaTarget<TMembers>, undefined>
	/** Stores included roles: their members are members of this role too. */
	// A deferred name-keyed target: reading the registry here would make a
	// registered application reference itself while it is typed (TS7022).
	readonly includedRoles: RelationField<
		DeferredSchemaTarget<() => SchemaRef<TClassName>>,
		undefined
	>
}

type RoleFieldMap<
	TClassName extends string,
	TMembers,
	TCustomFields,
> = TCustomFields & RoleOwnedFields<TClassName, TMembers>

/**
 * Describes the fields of one role schema: its own fields beside `name`,
 * `members` and `includedRoles`. One object type, not an intersection: a
 * registered application could otherwise reference itself while the role
 * schema is typed (TS7022).
 */
export type RoleSchemaFields<
	TClassName extends string,
	TMembers,
	TCustomFields extends SchemaFields,
> =
	RoleFieldMap<TClassName, TMembers, TCustomFields> extends infer TFields
		? { readonly [TKey in keyof TFields]: TFields[TKey] }
		: never

/** Static members of every role schema. */
export interface RoleSchemaStatics<TSchema extends SchemaDefinition> {
	/**
	 * Creates a normalized name reference without performing database I/O.
	 * @example `const Editor = TodoRole.role('editor')`
	 */
	role<const TName extends string>(
		name: TName,
	): RoleReference<TSchema, RoleNameSelector<TName>>
	/**
	 * Creates an explicit UUID reference without guessing string semantics.
	 * @example `TodoRole.role({ id: role.id })`
	 */
	role<const TId extends string>(
		selector: RoleIdSelector<TId>,
	): RoleReference<TSchema, RoleIdSelector<TId>>
}

/** Options of `App.RoleSchema.define(...)` (ADR-0322). */
export interface RoleSchemaOptions<
	TSource extends PluginSourceState,
	TClassName extends string,
	TMembers extends object,
	TFields extends SchemaFields,
> {
	/** Declares the stable logical name used by queries and adapters. */
	readonly className: TClassName
	/**
	 * Returns the schema whose rows may become direct members, lazily so that
	 * the two schemas may reference each other.
	 * @example `members: () => TodoUser`
	 */
	readonly members: TMembers
	/**
	 * Controls references registered by independent consumer plugins when a
	 * role is deleted: `fail` (the default) refuses the deletion, `preserve`
	 * leaves them inert, `cascade` asks their owners to remove them in the
	 * same transaction (Master only).
	 * @default "fail"
	 * @example `deletion: 'cascade'`
	 */
	readonly deletion?: RoleReferenceDeletionPolicy
	/**
	 * Adds application fields beside `name`, `members` and `includedRoles`.
	 * @example `fields: (field) => ({ description: field.string() })`
	 */
	readonly fields?: ConfiguredFieldDeclaration<TSource, TClassName, TFields>
	/**
	 * Role names created at `start()` when missing; existing roles are left
	 * unchanged.
	 * @example `ensure: ['admin', 'editor']`
	 */
	readonly ensure?: readonly string[]
	/**
	 * Replaces the current member for special cases. Omitted, the current
	 * member is the request principal when it belongs to the member schema
	 * (ADR-0304).
	 * @example `resolveCurrent: ({ context }) => readDelegate(context)`
	 */
	readonly resolveCurrent?: (
		input: RoleCurrentMemberInput,
	) => Pointer | undefined | Promise<Pointer | undefined>
}

/** Marks a declaration made by `App.RoleSchema.define` for the statics slot. */
type RoleSchemaDeclarationOptions = DeclaredSchemaShape<
	SchemaFactoryShape<'RoleSchema'>
>

/** The `App.RoleSchema` factory of an application that installs Roles. */
export interface RoleSchemaFactory<TSource extends PluginSourceState> {
	/**
	 * Declares one role schema; end with `.with({ ... })` like any schema.
	 * Several role schemas may live in one application.
	 *
	 * @example
	 * ```ts
	 * export const TodoRole = App.RoleSchema.define({
	 *   className: 'TodoRole',
	 *   members: () => TodoUser,
	 *   ensure: ['admin'],
	 * }).with({ access: { read: true } })
	 * ```
	 */
	define<
		const TClassName extends string,
		const TMembers extends object,
		const TFields extends SchemaFields = Readonly<Record<never, never>>,
	>(
		options: RoleSchemaOptions<TSource, TClassName, TMembers, TFields>,
	): DeclaredSchema<
		TSource,
		TClassName,
		RoleSchemaFields<TClassName, TMembers, TFields>,
		RoleSchemaDeclarationOptions
	>
}

/** The factories Roles adds to a configured application. */
export interface RoleSchemaFactoryMembers<TSource extends PluginSourceState> {
	/**
	 * Declares role schemas (ADR-0322).
	 * @example `App.RoleSchema.define({ className: 'TodoRole', members: () => TodoUser }).with({})`
	 */
	readonly RoleSchema: RoleSchemaFactory<TSource>
}

/** Adds `App.RoleSchema` to applications that install Roles. */
export interface RoleSchemaFactories extends SchemaFactoriesHKT {
	readonly factories: RoleSchemaFactoryMembers<
		Extract<this['source'], PluginSourceState>
	>
}

/** Adds `role(...)` to schemas declared by `App.RoleSchema.define`. */
export interface RoleSchemaStaticsSlot extends SchemaStaticsHKT {
	readonly statics: 'RoleSchema' extends keyof this['shape']
		? RoleSchemaStatics<Extract<this['schema'], SchemaDefinition>>
		: unknown
}

/** Retains package-private declaration state without polluting schema metadata. */
export interface RoleSchemaDeclaration {
	readonly deletionPolicy: RoleReferenceDeletionPolicy
	/** Role names created at start when missing. */
	readonly ensure: readonly string[]
	/** Resolves the member schema lazily; it may be declared after the roles. */
	readonly memberSchema: () => SchemaDefinition
	/** The exact resolver stays paired with its member schema behind package validation. */
	readonly resolveCurrent:
		((input: RoleCurrentMemberInput) => unknown) | undefined
}

const roleSchemaDeclarations = new WeakMap<object, RoleSchemaDeclaration>()

/** Narrows registered schemas to declarations created by `App.RoleSchema.define()`. */
export const getRoleSchemaDeclaration = (
	schema: SchemaDefinition,
): RoleSchemaDeclaration | undefined => roleSchemaDeclarations.get(schema)

const roleOptionKeys = new Set([
	'className',
	'deletion',
	'ensure',
	'fields',
	'members',
	'resolveCurrent',
])

const readDeletionPolicy = (value: unknown): RoleReferenceDeletionPolicy => {
	if (value === undefined) return 'fail'
	if (value !== 'fail' && value !== 'preserve' && value !== 'cascade') {
		throw new TypeError('deletion must be "fail", "preserve", or "cascade"')
	}
	return value
}

const readEnsure = (value: unknown): readonly string[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError('ensure must be a list of role names')
	}
	// Names are stored in their canonical form, so duplicates collapse here.
	return immutableArray([
		...new Set(
			value.map((name) => {
				if (typeof name !== 'string') {
					throw new TypeError('ensure must be a list of role names')
				}
				return normalizeRoleName(name)
			}),
		),
	])
}

type CustomFieldDeclaration = (field: unknown) => unknown

const readCustomFields = (
	value: unknown,
): CustomFieldDeclaration | undefined => {
	if (value === undefined) return undefined
	if (typeof value !== 'function') {
		throw new TypeError('fields must be a function')
	}
	return (field) => {
		const declared: unknown = Reflect.apply(value, undefined, [field])
		return declared
	}
}

const readMemberSchema =
	(members: () => unknown, className: string) => (): SchemaDefinition => {
		const schema = members()
		if (!Schema.is(schema)) {
			throw new TypeError(
				`${className}.members must return a schema created by App.Schema.define`,
			)
		}
		return schema
	}

const createRoleStatic =
	(schema: SchemaDefinition) =>
	(selector: unknown): RoleReference =>
		createRoleReference(
			schema,
			typeof selector === 'string'
				? { name: selector }
				: (selector as RoleIdSelector),
		)

/**
 * Creates the runtime of `App.RoleSchema` for one configured application
 * (ADR-0322): an ordinary declaration chain whose classes carry `role(...)`.
 */
export const createRoleSchemaFactory = ({
	define,
}: SchemaFactoryContext): Readonly<{ define: (options: unknown) => unknown }> =>
	Object.freeze({
		define: (options: unknown): unknown => {
			if (!isPlainRecord(options)) {
				throw new TypeError('RoleSchema options must be a plain object')
			}
			const unknownKey = Object.keys(options).find(
				(key) => !roleOptionKeys.has(key),
			)
			if (unknownKey !== undefined) {
				throw new TypeError(`Unknown RoleSchema option: ${unknownKey}`)
			}
			const { className, members, resolveCurrent } = options
			if (typeof className !== 'string' || className.length === 0) {
				throw new TypeError('className must be a non-empty string')
			}
			// A schema is a class: it must be wrapped so it may be declared later.
			if (typeof members !== 'function' || Schema.is(members)) {
				throw new TypeError(
					'members must return the member schema: members: () => User',
				)
			}
			if (
				resolveCurrent !== undefined &&
				typeof resolveCurrent !== 'function'
			) {
				throw new TypeError('resolveCurrent must be a function')
			}
			const customFields = readCustomFields(options.fields)
			const declaration: RoleSchemaDeclaration = Object.freeze({
				deletionPolicy: readDeletionPolicy(options.deletion),
				ensure: readEnsure(options.ensure),
				memberSchema: readMemberSchema(
					() => Reflect.apply(members, undefined, []),
					className,
				),
				resolveCurrent: resolveCurrent as
					((input: RoleCurrentMemberInput) => unknown) | undefined,
			})
			// The included-roles relation targets the last class of the chain,
			// the `.with(...)` result that the application registers.
			let self: SchemaDefinition | undefined
			const selfTarget = (): SchemaDefinition => {
				if (self === undefined) {
					throw new TypeError(`${className} is not declared yet`)
				}
				return self
			}
			const fields = (field: unknown): object => {
				const declared: unknown = customFields?.(field) ?? {}
				if (!isPlainRecord(declared)) {
					throw new TypeError(`${className}.fields must return an object`)
				}
				for (const reserved of reservedRoleFieldNames) {
					if (Object.hasOwn(declared, reserved)) {
						throw new TypeError(`Reserved role field: ${reserved}`)
					}
				}
				return {
					...declared,
					name: createRoleNameField(),
					members: relationField({ target: declaration.memberSchema }),
					includedRoles: relationField({ target: selfTarget }),
				}
			}
			return define(
				{
					className,
					fields,
					[roleSchemaIdentityOptionName]: createRoleSchemaIdentity(className),
				},
				(schema) => {
					self = schema
					roleSchemaDeclarations.set(schema, declaration)
					return { role: createRoleStatic(schema) }
				},
			)
		},
	})
