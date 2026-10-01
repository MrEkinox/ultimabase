import {
	Schema,
	UltimaBase,
	stringField,
	type ConfiguredFieldDeclaration,
	type ConfiguredSchemaDeclarationOptions,
	type ConfiguredSchemaNamespace,
	type PluginSourceState,
	type ScalarFieldTypegenState,
	type StringField,
	type SchemaFieldBuilderDeclaration,
	type SchemaFieldName,
	type SchemaFields,
	type SchemaIndexOptions,
	type SchemaReference,
	type UltimaBaseGeneratedSchemaOptions,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import {
	createPasswordUserAuthMethods,
	type PasswordUserAuthMethods,
} from './user-auth-methods.js'

const passwordUserDefinitionBrand: unique symbol = Symbol(
	'ultimabase.password-auth.user',
)

const passwordUserSchemas = new WeakSet<object>()
const reservedPasswordUserFields = new Set([
	'credential',
	'password',
	'passwordHash',
	'session',
	'username',
])

const createUsernameField = (): StringField<
	ScalarFieldTypegenState<true, false, true, false>
> =>
	stringField({
		immutable: true,
		indexed: 'unique',
		required: true,
	})

/** Names fields that belong exclusively to the Password Auth identity contract. */
export type ReservedPasswordUserFieldName =
	'credential' | 'password' | 'passwordHash' | 'session' | 'username'

type ReservedPasswordUserFieldCollision<TFields extends object> =
	string extends keyof TFields
		? unknown
		: Extract<keyof TFields, ReservedPasswordUserFieldName> extends never
			? unknown
			: never

/** Identifies an owned User without erasing its schema-specific command inputs. */
export type PasswordUserReference = SchemaReference<'User'> & {
	readonly [passwordUserDefinitionBrand]: true
}

/** Identifies one schema created through the final Password User composition point. */
export type PasswordUserDefinition<
	TCustomFields extends SchemaFields = SchemaFields,
> = SchemaReference<'User'> &
	PasswordUserAuthMethods<TCustomFields> & {
		readonly [passwordUserDefinitionBrand]: true
	}

/** Declares ordinary application fields beside the package-owned username. */
export interface PasswordUserSchemaOptions<
	TCustomFields extends SchemaFields = SchemaFields,
> extends UltimaBaseGeneratedSchemaOptions {
	/** Keeps the stable identity model name fixed across default and custom users. */
	readonly className: 'User'
	/** Adds application fields without replacing Password Auth identity fields. */
	readonly fields: SchemaFieldBuilderDeclaration<TCustomFields>
	/** Declares composite indexes across custom fields and the canonical username. */
	readonly indexes?: readonly SchemaIndexOptions<
		SchemaFieldName<NoInfer<TCustomFields>> | 'username'
	>[]
}

/** Checks exact package-owned User schema provenance at plugin configuration time. */
export const isPasswordUserDefinition = (
	value: unknown,
): value is PasswordUserReference =>
	typeof value === 'function' && passwordUserSchemas.has(value)

/** Defines final Password Auth User schemas without subclassing or mutation. */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PasswordUserSchema {
	private constructor() {
		throw new TypeError(
			'Use PasswordUserSchema.define() to declare a User schema',
		)
	}

	/**
	 * Adds ordinary application fields beside the required immutable username.
	 *
	 * @example
	 * ```ts
	 * const AppUser = PasswordUserSchema.define(Base.Schema, {
	 *   className: 'User',
	 *   fields: (field) => ({ displayName: field.string() }),
	 * })
	 * const result = await AppUser.signUp({ username: 'Ada', password })
	 * ```
	 */
	static define<
		TSource extends PluginSourceState,
		const TFieldDeclaration extends ConfiguredFieldDeclaration<
			TSource,
			'User',
			SchemaFields
		>,
		const TDeclaredOptions extends Readonly<{
			className: 'User'
			fields: TFieldDeclaration
		}>,
	>(
		schema: ConfiguredSchemaNamespace<TSource>,
		options: ConfiguredSchemaDeclarationOptions<
			TSource,
			'User',
			TFieldDeclaration,
			TDeclaredOptions,
			ReturnType<TFieldDeclaration> &
				Readonly<{ username: ReturnType<typeof createUsernameField> }>
		> &
			ReservedPasswordUserFieldCollision<
				NoInfer<ReturnType<TFieldDeclaration>>
			>,
	): PasswordUserDefinition<ReturnType<TFieldDeclaration>>
	/** Declares a standalone User whose complete application types remain generated. */
	static define<const TCustomFields extends SchemaFields>(
		options: PasswordUserSchemaOptions<TCustomFields> &
			ReservedPasswordUserFieldCollision<NoInfer<TCustomFields>>,
	): PasswordUserDefinition<TCustomFields>
	static define<const TCustomFields extends SchemaFields>(
		optionsOrSchema:
			| ConfiguredSchemaNamespace<PluginSourceState>
			| PasswordUserSchemaOptions<TCustomFields>,
		configuredOptions?: PasswordUserSchemaOptions<TCustomFields>,
	): unknown {
		// Like RoleSchema, the namespace supplies source types while the single
		// specialization compiler retains generated User results and Runtime identity.
		if (
			configuredOptions !== undefined &&
			!Object.is(optionsOrSchema, UltimaBase.Schema)
		) {
			throw new TypeError(
				'Password User configured declarations require an UltimaBase Schema namespace',
			)
		}
		const options =
			configuredOptions ??
			(optionsOrSchema as PasswordUserSchemaOptions<TCustomFields>)
		const untrustedOptions: unknown = options
		if (
			!isPlainRecord(untrustedOptions) ||
			untrustedOptions.className !== 'User'
		) {
			throw new TypeError('Password User className must be User')
		}
		const {
			className,
			fields: declareCustomFields,
			indexes,
			...generatedOptions
		} = options
		const fields: SchemaFieldBuilderDeclaration<SchemaFields, 'User'> = (
			field,
		) => {
			const customFields = declareCustomFields(field)
			for (const name of Object.keys(customFields)) {
				if (reservedPasswordUserFields.has(name)) {
					throw new TypeError(`Reserved Password User field: ${name}`)
				}
			}
			return { ...customFields, username: createUsernameField() }
		}
		const specializedOptions: {
			readonly className: 'User'
			readonly fields: SchemaFieldBuilderDeclaration<SchemaFields, 'User'>
			readonly indexes?: readonly SchemaIndexOptions[]
		} = {
			...generatedOptions,
			className,
			fields,
			...(indexes === undefined ? {} : { indexes }),
		}
		const schema = Schema.defineSpecialized(
			specializedOptions,
			({ schema: exactSchema }) => ({
				results: {},
				statics: {
					...createPasswordUserAuthMethods<TCustomFields>(exactSchema),
					[passwordUserDefinitionBrand]: true as const,
				},
			}),
		)
		passwordUserSchemas.add(schema)
		return schema
	}
}

/** Provides the stable default local User with no application-specific fields. */
export const PasswordUser: PasswordUserDefinition<
	Readonly<Record<never, never>>
> = PasswordUserSchema.define({
	className: 'User',
	fields: () => ({}),
})
