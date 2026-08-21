import {
	Schema,
	relationField,
	stringField,
	type RequestRoleReferenceCarrier,
	type Pointer,
	type RelationField,
	type SchemaReference,
	type SchemaDefinition,
	type SchemaFields,
	type SchemaFieldBuilderDeclaration,
	type SchemaIndexOptions,
	type SchemaModelCapabilityContext,
	type SchemaResultCapabilityCarrier,
	type ScalarFieldTypegenState,
	type StringField,
	type UltimaBaseGeneratedSchemaOptions,
} from '@ultimabase/core'
import type { AccessContext, SchemaAccess } from '@ultimabase/access-plugin'

import {
	createRoleReference,
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
import {
	createRoleSchemaIdentity,
	roleSchemaIdentityOptionName,
} from './role-schema-identity.js'

/** Identifies the option-light official provider owning RoleSchema behavior. */
export const rolesPluginName = 'ultimabase.roles' as const

const createRoleNameField = (): StringField<
	ScalarFieldTypegenState<true, false, false, false>
> =>
	stringField({
		indexed: 'unique',
		validation: { required: true, length: { min: 1 } },
	})

type RoleNameField = ReturnType<typeof createRoleNameField>

/** Names fields reserved for portable role semantics. */
export type ReservedRoleFieldName = 'members' | 'name' | 'roles'

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
	/**
	 * Maps immutable request-local plugin state to one exact member Pointer.
	 *
	 * Omission makes current-member Access checks deny normally while retaining
	 * every administrative RoleSchema and QueryBuilder capability.
	 *
	 * @example `resolveCurrent: ({ context }) => toUserPointer(context.getValue(principal))`
	 */
	readonly resolveCurrent?: (
		input: RoleCurrentMemberInput,
	) =>
		| Pointer<TMemberSchema>
		| undefined
		| Promise<Pointer<TMemberSchema> | undefined>
}

/** Selects how one role deletion treats references owned outside its schema. */
export type RoleReferenceDeletionPolicy = 'cascade' | 'fail' | 'preserve'

/** Configures stable reference behavior without adding plugin execution options. */
export interface RoleDeletionOptions {
	/**
	 * Controls references registered by independent consumer plugins.
	 *
	 * `fail` is the safe default. `preserve` leaves inert external references,
	 * while `cascade` transactionally asks their owners to remove them.
	 *
	 * @example `references: "cascade"`
	 */
	readonly references?: RoleReferenceDeletionPolicy
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
export type RoleSchemaSelfDefinition<TClassName extends string> =
	SchemaReference<TClassName>

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
type RoleSchemaBaseClass<TClassName extends string = string> =
	SchemaReference<TClassName>

/** Represents one exact constructible role schema declared by the application. */
export type RoleSchemaClass<
	TClassName extends string = string,
	TMemberSchema extends SchemaDefinition = SchemaDefinition,
> = RoleSchemaBaseClass<TClassName> &
	RoleSchemaStatics<RoleSchemaSelfDefinition<TClassName>> &
	SchemaResultCapabilityCarrier<
		RequestRoleReferenceCarrier &
			RoleMemberCommands<RoleSchemaSelfDefinition<TClassName>, TMemberSchema> &
			RoleHierarchyCommands<RoleSchemaSelfDefinition<TClassName>>
	>

/** Declares the developer-owned portion of a role-aware schema. */
export interface RoleSchemaOptions<
	TClassName extends string,
	TMemberSchema extends SchemaDefinition,
> extends Omit<
	UltimaBaseGeneratedSchemaOptions,
	'access' | typeof roleSchemaIdentityOptionName
> {
	/** Declares the stable logical name used by queries and adapters. */
	readonly className: TClassName
	/** Selects the exact member domain and optional request-local resolver. */
	readonly members: RoleMemberOptions<TMemberSchema>
	/** Adds ordinary application fields beside generated role fields. */
	readonly fields: SchemaFieldBuilderDeclaration
	/** Owns the default external-reference behavior for every role deletion. */
	readonly deletion?: RoleDeletionOptions
	/** Declares adapter-neutral composite indexes for custom and generated scalar fields. */
	readonly indexes?: readonly SchemaIndexOptions[]
	/** Protects role administration when the official Access plugin is installed. */
	readonly access?: SchemaAccess<RoleSchemaBaseClass<TClassName>>
}

/** Retains package-private declaration state without polluting schema metadata. */
export interface RoleSchemaDeclaration {
	readonly deletionPolicy: RoleReferenceDeletionPolicy
	readonly memberSchema: SchemaDefinition
	/** The exact resolver stays paired with its member schema behind package validation. */
	readonly resolveCurrent:
		((input: RoleCurrentMemberInput) => unknown) | undefined
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
	 *   fields: (field) => ({ description: field.string() }),
	 * })
	 * ```
	 */
	static define<
		const TClassName extends string,
		const TMemberSchema extends SchemaDefinition,
	>(
		options: RoleSchemaOptions<TClassName, TMemberSchema>,
	): RoleSchemaClass<TClassName, TMemberSchema>

	static define<
		const TClassName extends string,
		const TMemberSchema extends SchemaDefinition,
	>(options: RoleSchemaOptions<TClassName, TMemberSchema>): unknown {
		if (Object.hasOwn(options, 'extensions')) {
			throw new TypeError(
				'RoleSchema extensions are not supported; use direct plugin options',
			)
		}

		if (!Schema.is(options.members.schema)) {
			throw new TypeError('members.schema must be created by Schema.define')
		}

		const configuredDeletionPolicy: unknown =
			options.deletion === undefined
				? undefined
				: Reflect.get(options.deletion, 'references')
		const deletionPolicy = configuredDeletionPolicy ?? 'fail'

		if (
			deletionPolicy !== 'fail' &&
			deletionPolicy !== 'preserve' &&
			deletionPolicy !== 'cascade'
		) {
			throw new TypeError(
				'deletion.references must be "fail", "preserve", or "cascade"',
			)
		}

		const selfTargetState: {
			roleSchema?: RoleSchemaClass<TClassName, TMemberSchema>
		} = {}
		const selfTarget = (): RoleSchemaSelfDefinition<TClassName> => {
			if (selfTargetState.roleSchema === undefined) {
				throw new TypeError('Role schema self target is not initialized')
			}

			return selfTargetState.roleSchema
		}
		const fields: SchemaFieldBuilderDeclaration = (field) => {
			const customFields = options.fields(field)

			for (const fieldName of ['members', 'name', 'roles'] as const) {
				if (Object.hasOwn(customFields, fieldName)) {
					throw new TypeError(`Reserved role field: ${fieldName}`)
				}
			}

			return {
				...customFields,
				name: createRoleNameField(),
				members: relationField({ target: () => options.members.schema }),
				roles: relationField({ target: selfTarget }),
			}
		}
		const generatedOptions = Object.fromEntries(
			Object.entries(options).filter(
				([name]) =>
					!new Set([
						'access',
						'className',
						'deletion',
						'extensions',
						'fields',
						'indexes',
						'members',
					]).has(name),
			),
		)
		type SelfSchema = RoleSchemaSelfDefinition<TClassName>
		const createCapabilities = (
			context: SchemaModelCapabilityContext<SchemaDefinition>,
		) => {
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

			const toRequestRoleReference = function (
				this: object,
			): RoleReference<SelfSchema, RoleIdSelector> {
				exactContext.assertPersisted(this, 'toRequestRoleReference')

				if (!('id' in this) || typeof this.id !== 'string') {
					throw new TypeError(
						'Persisted role has no valid framework identifier',
					)
				}

				// The neutral reference keeps ACL and other consumers independent from roles.
				return createRoleReference(exactSchema, { id: this.id })
			}
			const resultCapabilities: RequestRoleReferenceCarrier &
				RoleMemberCommands<SelfSchema, TMemberSchema> &
				RoleHierarchyCommands<SelfSchema> = {
				toRequestRoleReference,
				...createRoleMemberCommands(exactContext, options.members.schema),
				...createRoleHierarchyCommands<SelfSchema>(exactContext),
			}

			return {
				statics: { role } satisfies RoleSchemaStatics<SelfSchema>,
				results: resultCapabilities,
			}
		}
		const commonOptions = {
			...generatedOptions,
			[roleSchemaIdentityOptionName]: createRoleSchemaIdentity(
				options.className,
			),
			className: options.className,
			fields,
			...(options.indexes === undefined ? {} : { indexes: options.indexes }),
			...(options.access === undefined ? {} : { access: options.access }),
		}
		// Public overloads retain exact map or generated builder types. This internal
		// specialization deliberately crosses their union only after constructing the
		// corresponding runtime declaration and capability factory together.
		const schemaDefinition = Schema as unknown as {
			readonly defineWithCapabilities: (
				options: typeof commonOptions,
				factory: typeof createCapabilities,
			) => SchemaDefinition
		}
		const definedSchema = schemaDefinition.defineWithCapabilities(
			commonOptions,
			createCapabilities,
		)

		// The exact public type mirrors the fields and statics attached above.
		const roleSchema = definedSchema as unknown as RoleSchemaClass<
			TClassName,
			TMemberSchema
		>
		selfTargetState.roleSchema = roleSchema
		roleSchemaDeclarations.set(
			roleSchema,
			Object.freeze({
				deletionPolicy,
				memberSchema: options.members.schema,
				resolveCurrent: options.members.resolveCurrent,
			}),
		)

		return roleSchema
	}
}
