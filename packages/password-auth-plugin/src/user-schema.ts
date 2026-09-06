import {
	Schema,
	stringField,
	type SchemaFieldBuilderDeclaration,
	type SchemaFieldName,
	type SchemaFields,
	type SchemaIndexOptions,
	type SchemaReference,
	type UltimaBaseGeneratedSchemaOptions,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'

declare const passwordUserDefinitionBrand: unique symbol

const passwordUserSchemas = new WeakSet<object>()
const reservedPasswordUserFields = new Set([
	'credential',
	'password',
	'passwordHash',
	'session',
	'username',
])

const createUsernameField = () =>
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

/** Identifies one schema created through the final Password User composition point. */
export type PasswordUserDefinition<
	TCustomFields extends SchemaFields = SchemaFields,
> = SchemaReference<'User'> & {
	readonly [passwordUserDefinitionBrand]: TCustomFields
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
): value is PasswordUserDefinition =>
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
	 * const AppUser = PasswordUserSchema.define({
	 *   className: 'User',
	 *   fields: (field) => ({ displayName: field.string() }),
	 * })
	 * ```
	 */
	static define<const TCustomFields extends SchemaFields>(
		options: PasswordUserSchemaOptions<TCustomFields> &
			ReservedPasswordUserFieldCollision<NoInfer<TCustomFields>>,
	): PasswordUserDefinition<TCustomFields> {
		const untrustedOptions: unknown = options
		if (
			!isPlainRecord(untrustedOptions) ||
			untrustedOptions.className !== 'User'
		) {
			throw new TypeError('Password User className must be User')
		}
		const {
			fields: declareCustomFields,
			indexes,
			...generatedOptions
		} = options
		const fields: SchemaFieldBuilderDeclaration = (field) => {
			const customFields = declareCustomFields(field)
			for (const name of Object.keys(customFields)) {
				if (reservedPasswordUserFields.has(name)) {
					throw new TypeError(`Reserved Password User field: ${name}`)
				}
			}
			return { ...customFields, username: createUsernameField() }
		}
		const definition = Schema as unknown as {
			define(
				options: Readonly<Record<string, unknown>>,
			): SchemaReference<'User'>
		}
		const schema = definition.define({
			...generatedOptions,
			fields,
			...(indexes === undefined ? {} : { indexes }),
		})
		passwordUserSchemas.add(schema)
		return schema as unknown as PasswordUserDefinition<TCustomFields>
	}
}

/** Provides the stable default local User with no application-specific fields. */
export const PasswordUser: PasswordUserDefinition<
	Readonly<Record<never, never>>
> = PasswordUserSchema.define({
	className: 'User',
	fields: () => ({}),
})
