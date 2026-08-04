import {
	relationField,
	Schema,
	stringField,
	defineSchemaExtension,
	type AccessContext,
	type Pointer,
	type RelationField,
	type SchemaAccess,
	type SchemaClass,
	type SchemaDefinition,
	type SchemaExtension,
	type SchemaFields,
	type SchemaHooks,
	type SchemaFieldName,
	type SchemaIndexOptions,
	type SchemaModelCapabilityContext,
	type SchemaResultCapabilityCarrier,
	type ScalarFieldInferenceState,
	type StringField,
} from '@ultimabase/core'

import {
	createRoleReference,
	normalizeRoleName,
	type RoleIdSelector,
	type RoleNameSelector,
	type RoleReference,
} from './role-reference.js'
import {
	createRoleMemberCommands,
	type RoleMemberCommands,
} from './role-member.js'
import {
	createRoleHierarchyCommands,
	type RoleHierarchyCommands,
} from './role-hierarchy.js'

/** Identifies the extension claimed by the official roles plugin. */
export const roleSchemaExtensionName = 'ultimabase.roles.schema' as const

/** Identifies the option-light official provider owning RoleSchema behavior. */
export const rolesPluginName = 'ultimabase.roles' as const

interface RoleSchemaExtensionConfig {
	readonly transportVisibility: 'hidden'
	readonly version: 1
}

const roleSchemaExtension: SchemaExtension<
	typeof roleSchemaExtensionName,
	RoleSchemaExtensionConfig,
	typeof rolesPluginName
> = defineSchemaExtension(
	roleSchemaExtensionName,
	{
		// Transport generators treat role administration as opt-in surface area.
		transportVisibility: 'hidden',
		version: 1,
	},
	rolesPluginName,
)

const createRoleNameField = (): StringField<
	ScalarFieldInferenceState<true, false, false, false, false>
> =>
	stringField({
		indexed: 'unique',
		validation: { required: true, length: { min: 1 } },
		hooks: {
			// The stored name is itself the canonical identity; no duplicate column can drift.
			resolveInput: ({ value }) => normalizeRoleName(value),
		},
	})

type RoleNameField = ReturnType<typeof createRoleNameField>

/** Names fields reserved for portable role semantics. */
export type ReservedRoleFieldName = 'members' | 'name' | 'roles'

type ReservedRoleFieldCollision<TFields extends SchemaFields> = Extract<
	keyof TFields,
	ReservedRoleFieldName
> extends never
	? unknown
	: never

/** Resolves the current request member without coupling roles to authentication. */
export interface RoleCurrentMemberInput {
	readonly context: AccessContext
}

/** Configures the exact schema accepted by one independent role domain. */
export interface RoleMemberOptions<
	TMemberSchema extends SchemaDefinition = SchemaDefinition,
> {
	/** The exact schema whose persisted objects may become direct role members. */
	readonly schema: TMemberSchema
	/** Optionally maps request-local plugin state to one exact member pointer. */
	readonly resolveCurrent?: (
		input: RoleCurrentMemberInput,
	) =>
		| Pointer<TMemberSchema>
		| undefined
		| Promise<Pointer<TMemberSchema> | undefined>
}

/** Describes the generated fields shared by every developer-defined role schema. */
export type RoleSchemaFields<
	TMemberSchema extends SchemaDefinition,
	TSelf extends SchemaDefinition,
	TCustomFields extends SchemaFields,
> = Readonly<TCustomFields> &
	Readonly<{
		/** Stores the canonical locale-independent role identity. */
		name: RoleNameField
		/** Stores direct members from the declared member schema. */
		members: RelationField<TMemberSchema>
		/** Stores child roles whose members are inherited by this role. */
		roles: RelationField<TSelf>
	}>

/** Represents the self target retained by the generated nested-role relation. */
export type RoleSchemaSelfDefinition<
	TClassName extends string,
	TMemberSchema extends SchemaDefinition,
	TCustomFields extends SchemaFields,
	TExtensions extends readonly SchemaExtension<string, object>[],
> = SchemaDefinition<
		TClassName,
		RoleSchemaFields<
			TMemberSchema,
			RoleSchemaSelfDefinition<
				TClassName,
				TMemberSchema,
				TCustomFields,
				TExtensions
			>,
			TCustomFields
		>,
		readonly [...TExtensions, typeof roleSchemaExtension]
	>

/** Adds lightweight reference construction to one exact generated schema class. */
export interface RoleSchemaStatics<TSchema extends SchemaDefinition> {
	/** Creates a normalized name reference without performing database I/O. */
	role<const TName extends string>(
		name: TName,
	): RoleReference<TSchema, RoleNameSelector<TName>>
	/** Creates an explicit UUID reference without guessing string semantics. */
	role<const TId extends string>(
		selector: RoleIdSelector<TId>,
	): RoleReference<TSchema, RoleIdSelector<TId>>
}

/** Represents one exact constructible role schema declared by the application. */
type RoleSchemaBaseClass<
	TClassName extends string = string,
	TMemberSchema extends SchemaDefinition = SchemaDefinition,
	TCustomFields extends SchemaFields = SchemaFields,
	TExtensions extends readonly SchemaExtension<string, object>[] = readonly [],
> = SchemaClass<
	TClassName,
	RoleSchemaFields<
		TMemberSchema,
		RoleSchemaSelfDefinition<
			TClassName,
			TMemberSchema,
			TCustomFields,
			TExtensions
		>,
		TCustomFields
	>,
	readonly [...TExtensions, typeof roleSchemaExtension]
>

/** Represents one exact constructible role schema declared by the application. */
export type RoleSchemaClass<
	TClassName extends string = string,
	TMemberSchema extends SchemaDefinition = SchemaDefinition,
	TCustomFields extends SchemaFields = SchemaFields,
	TExtensions extends readonly SchemaExtension<string, object>[] = readonly [],
> = RoleSchemaBaseClass<
	TClassName,
	TMemberSchema,
	TCustomFields,
	TExtensions
> &
	RoleSchemaStatics<
		RoleSchemaSelfDefinition<
			TClassName,
			TMemberSchema,
			TCustomFields,
			TExtensions
		>
	> &
	SchemaResultCapabilityCarrier<
		RoleMemberCommands<
			RoleSchemaSelfDefinition<
				TClassName,
				TMemberSchema,
				TCustomFields,
				TExtensions
			>,
			TMemberSchema
		> &
			RoleHierarchyCommands<
				RoleSchemaSelfDefinition<
					TClassName,
					TMemberSchema,
					TCustomFields,
					TExtensions
				>,
				RoleSchemaClass<
					TClassName,
					TMemberSchema,
					TCustomFields,
					TExtensions
				>
			>
	>

/** Declares the developer-owned portion of a role-aware schema. */
export interface RoleSchemaOptions<
	TClassName extends string,
	TMemberSchema extends SchemaDefinition,
	TCustomFields extends SchemaFields,
	TExtensions extends readonly SchemaExtension<string, object>[],
> {
	/** Declares the stable logical name used by queries and adapters. */
	readonly className: TClassName
	/** Selects the exact member domain and optional request-local resolver. */
	readonly members: RoleMemberOptions<TMemberSchema>
	/** Adds ordinary application fields beside generated role fields. */
	readonly fields: TCustomFields
	/** Declares adapter-neutral composite indexes for custom and generated scalar fields. */
	readonly indexes?: readonly SchemaIndexOptions<
		SchemaFieldName<
			RoleSchemaFields<
				TMemberSchema,
				RoleSchemaSelfDefinition<
					TClassName,
					TMemberSchema,
					TCustomFields,
					TExtensions
				>,
				TCustomFields
			>
		>
	>[]
	/** Attaches ordinary plugin-owned schema metadata before the roles extension. */
	readonly extensions?: TExtensions
	/** Protects role administration through native schema Access. */
	readonly access?: SchemaAccess<
		RoleSchemaBaseClass<
			TClassName,
			TMemberSchema,
			TCustomFields,
			TExtensions
		>
	>
	/** Adds ordinary schema lifecycle behavior to role persistence. */
	readonly hooks?: SchemaHooks<
		RoleSchemaBaseClass<
			TClassName,
			TMemberSchema,
			TCustomFields,
			TExtensions
		>
	>
}

/** Retains package-private declaration state without polluting schema metadata. */
export interface RoleSchemaDeclaration {
	readonly memberSchema: SchemaDefinition
	/** The exact resolver stays paired with its member schema behind package validation. */
	readonly resolveCurrent:
		| ((input: RoleCurrentMemberInput) => unknown)
		| undefined
}

const roleSchemaDeclarations = new WeakMap<object, RoleSchemaDeclaration>()

/** Narrows registered schemas to declarations created by `RoleSchema.define()`. */
export const getRoleSchemaDeclaration = (
	schema: SchemaDefinition,
): RoleSchemaDeclaration | undefined => roleSchemaDeclarations.get(schema)

/** Declares role-specialized schema model classes without owning persistence. */
// A static class keeps role schema declaration aligned with `Schema.define()`.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class RoleSchema {
	private constructor() {
		throw new TypeError('Use RoleSchema.define() to declare a role schema')
	}

	/**
	 * Defines one extensible stored-role schema for an exact member domain.
	 *
	 * @example
	 * ```ts
	 * const AppRole = RoleSchema.define({
	 *   className: 'Role',
	 *   members: { schema: User },
	 *   fields: { description: stringField() },
	 * })
	 * ```
	 */
	static define<
		const TClassName extends string,
		const TMemberSchema extends SchemaDefinition,
		const TCustomFields extends SchemaFields,
		const TExtensions extends readonly SchemaExtension<
			string,
			object
		>[] = readonly [],
	>(
		options: RoleSchemaOptions<
			TClassName,
			TMemberSchema,
			TCustomFields,
			TExtensions
		> &
			ReservedRoleFieldCollision<NoInfer<TCustomFields>>,
	): RoleSchemaClass<
		TClassName,
		TMemberSchema,
		TCustomFields,
		TExtensions
	> {
		if (!Schema.is(options.members.schema)) {
			throw new TypeError('members.schema must be created by Schema.define')
		}

		for (const fieldName of ['members', 'name', 'roles'] as const) {
			if (Object.hasOwn(options.fields, fieldName)) {
				throw new TypeError(`Reserved role field: ${fieldName}`)
			}
		}

		const selfTargetState: {
			roleSchema?: RoleSchemaClass<
					TClassName,
					TMemberSchema,
					TCustomFields,
					TExtensions
			  >
		} = {}
		const selfTarget = (): RoleSchemaSelfDefinition<
			TClassName,
			TMemberSchema,
			TCustomFields,
			TExtensions
		> => {
			if (selfTargetState.roleSchema === undefined) {
				throw new TypeError('Role schema self target is not initialized')
			}

			return selfTargetState.roleSchema
		}
		const fields: RoleSchemaFields<
			TMemberSchema,
			RoleSchemaSelfDefinition<
				TClassName,
				TMemberSchema,
				TCustomFields,
				TExtensions
			>,
			TCustomFields
		> = {
			...options.fields,
			name: createRoleNameField(),
			members: relationField({ target: () => options.members.schema }),
			roles: relationField({ target: selfTarget }),
		}
		const extensions = [
			...(options.extensions ?? []),
			roleSchemaExtension,
		] as readonly [...TExtensions, typeof roleSchemaExtension]
		type SelfSchema = RoleSchemaSelfDefinition<
			TClassName,
			TMemberSchema,
			TCustomFields,
			TExtensions
		>
		const definedSchema = Schema.defineWithCapabilities(
			{
				className: options.className,
				fields,
				extensions,
				...(options.indexes === undefined
					? {}
					: { indexes: options.indexes }),
				...(options.access === undefined
					? {}
					: { access: options.access }),
				...(options.hooks === undefined ? {} : { hooks: options.hooks }),
			},
			(context) => {
				const exactSchema = context.schema as unknown as SelfSchema
				const exactContext =
					context as unknown as SchemaModelCapabilityContext<SelfSchema>

				function role<const TName extends string>(
					name: TName,
				): RoleReference<SelfSchema, RoleNameSelector<TName>>
				function role<const TId extends string>(
					selector: RoleIdSelector<TId>,
				): RoleReference<SelfSchema, RoleIdSelector<TId>>
				function role(
					selector: string | RoleIdSelector,
				): RoleReference<SelfSchema> {
					return createRoleReference(
						exactSchema,
						typeof selector === 'string' ? { name: selector } : selector,
					)
				}

				return {
					statics: { role } satisfies RoleSchemaStatics<SelfSchema>,
					results: {
						...createRoleMemberCommands(
							exactContext,
							options.members.schema,
						),
						...createRoleHierarchyCommands<
							SelfSchema,
							RoleSchemaClass<
								TClassName,
								TMemberSchema,
								TCustomFields,
								TExtensions
							>
						>(exactContext),
					},
				}
			},
		)

		// The exact public type mirrors the fields and statics attached above.
		const roleSchema: RoleSchemaClass<
			TClassName,
			TMemberSchema,
			TCustomFields,
			TExtensions
		> = definedSchema
		selfTargetState.roleSchema = roleSchema
		roleSchemaDeclarations.set(
			roleSchema,
			Object.freeze({
				memberSchema: options.members.schema,
				resolveCurrent: options.members.resolveCurrent,
			}),
		)

		return roleSchema
	}
}
