import {
	Schema,
	type ConfiguredFieldDeclaration,
	type DeclaredSchema,
	type SchemaDefinition,
	type SchemaFields,
	type SchemaReference,
} from '@ultimabase/core'
import type {
	CompleteDefineFields,
	ConfiguredSchemaIndex,
	DefineFeatureCheck,
	DefineFeatureOptions,
	DefineFeatures,
	DefineFeaturesNotInferred,
	DefineUniqueIndexFields,
	PluginSourceState,
	SchemaFactoriesHKT,
	SchemaFactoryContext,
	SchemaFactoryShape,
	SchemaStaticsHKT,
} from '@ultimabase/core/plugin'
import { isPlainRecord } from '@ultimabase/shared'

import { emailFieldNames } from './email.js'
import type { AuthState } from './foundation.js'
import {
	authUserIdentityOptionName,
	createAuthUserIdentity,
} from './user-identity.js'
import type { AuthMethodImplementation, AuthMethodStatics } from './method.js'
import {
	createStaticsServices,
	createUserStatics,
	type AuthUserStatics,
} from './user-statics.js'

/** Options of `App.UserSchema.define(...)` (ADR-0326). */
export interface UserSchemaOptions<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaFields,
	TIndexes = readonly ConfiguredSchemaIndex<SchemaFields>[],
> {
	/** Any class name, such as `TodoUser`. */
	readonly className: TClassName
	/**
	 * Adds application fields beside the fields of the installed methods,
	 * such as `email` for `password({ identifier: 'email' })`.
	 * @example `fields: (field) => ({ displayName: field.string({ required: true }) })`
	 */
	readonly fields?: ConfiguredFieldDeclaration<TSource, TClassName, TFields>
	/**
	 * Declares indexes over the complete User fields: its own, the methods'
	 * and those of the features set beside it (ADR-0339). A unique index
	 * without `where` is a unique target of `updateOne` and `deleteOne`.
	 * @example `indexes: [{ fields: ['displayName'], unique: true }]`
	 */
	readonly indexes?: TIndexes
}

/**
 * The fields of a User schema: its own beside the methods' fields. One
 * object type, not an intersection, so a registered application never
 * references itself while the User is typed (TS7022).
 */
export type UserSchemaFields<TCustomFields, TMethodFields> = TCustomFields &
	TMethodFields extends infer TFields
	? { readonly [TKey in keyof TFields]: TFields[TKey] }
	: never

/** The `App.UserSchema` factory of an application that installs `authPlugin`. */
export interface UserSchemaFactory<
	TSource extends PluginSourceState,
	TMethodFields,
> {
	/**
	 * Declares the one User schema of the application, with `indexes` and the
	 * feature keys of the installed plugins (ADR-0339); end with `.with(...)`
	 * like any schema. Its class gains `signUp`, `login`, `current`, … .
	 *
	 * @example
	 * ```ts
	 * export const TodoUser = App.UserSchema.define({
	 *   className: 'TodoUser',
	 *   fields: (field) => ({ displayName: field.string() }),
	 * }).with({ access: { read: isAuthenticated } })
	 * ```
	 */
	define<
		const TClassName extends string,
		const TFields extends SchemaFields = Readonly<Record<never, never>>,
		// The whole options object, captured once (ADR-0339).
		const TFeatures extends DefineFeatureCheck<
			TSource,
			UserSchemaFields<TFields, TMethodFields>,
			TFeatures
		> = DefineFeaturesNotInferred,
	>(
		options: UserSchemaOptions<
			TSource,
			TClassName,
			TFields,
			readonly ConfiguredSchemaIndex<
				CompleteDefineFields<
					TSource,
					UserSchemaFields<TFields, TMethodFields>,
					TFeatures
				>
			>[]
		> &
			DefineFeatures<TSource> &
			TFeatures,
	): DeclaredSchema<
		TSource,
		TClassName,
		UserSchemaFields<TFields, TMethodFields>,
		DefineFeatureOptions<TSource, TFeatures, SchemaFactoryShape<'UserSchema'>>,
		DefineUniqueIndexFields<TFeatures>
	>
}

/** The factories `authPlugin` adds to a configured application. */
export interface UserSchemaFactoryMembers<
	TSource extends PluginSourceState,
	TMethodFields,
> {
	/**
	 * Declares the User schema (ADR-0326).
	 * @example `App.UserSchema.define({ className: 'TodoUser' })`
	 */
	readonly UserSchema: UserSchemaFactory<TSource, TMethodFields>
}

/** Adds `App.UserSchema` to applications that install `authPlugin`. */
export interface UserSchemaFactories<TMethodFields> extends SchemaFactoriesHKT {
	readonly factories: UserSchemaFactoryMembers<
		Extract<this['source'], PluginSourceState>,
		TMethodFields
	>
}

/** Adds the foundation's and methods' members to the User class. */
export interface UserSchemaStaticsSlot<TMethods> extends SchemaStaticsHKT {
	readonly statics: 'UserSchema' extends keyof this['shape']
		? AuthUserStatics<Extract<this['schema'], SchemaDefinition>> &
				AuthMethodStatics<TMethods, Extract<this['schema'], SchemaDefinition>>
		: unknown
}

const optionKeys = new Set(['className', 'fields', 'indexes'])

/**
 * Creates the runtime of `App.UserSchema` for one plugin instance: one User
 * schema, whose fields include the methods' fields and whose classes carry
 * the foundation's and methods' statics.
 */
export const createUserSchemaFactory =
	(
		state: AuthState,
		methods: readonly AuthMethodImplementation[],
		pluginId: string,
	) =>
	({
		define,
		features,
	}: SchemaFactoryContext): Readonly<{
		define: (options: unknown) => unknown
	}> =>
		Object.freeze({
			define: (options: unknown): unknown => {
				if (!isPlainRecord(options)) {
					throw new TypeError('UserSchema options must be a plain object')
				}
				// Feature keys (`softDelete: true`) and `indexes` go to Core's define.
				const unknownKey = Object.keys(options).find(
					(key) => !optionKeys.has(key) && !features.has(key),
				)
				if (unknownKey !== undefined) {
					throw new TypeError(`Unknown UserSchema option: ${unknownKey}`)
				}
				const { className, fields: customFields } = options
				// `indexes` and feature keys, copied as entries (`__proto__` included).
				const declaration = Object.fromEntries(
					Object.entries(options).filter(
						([key]) => key !== 'className' && key !== 'fields',
					),
				)
				if (typeof className !== 'string' || className.length === 0) {
					throw new TypeError('className must be a non-empty string')
				}
				if (customFields !== undefined && typeof customFields !== 'function') {
					throw new TypeError('fields must be a function')
				}
				if (
					state.userClassName !== undefined &&
					state.userClassName !== className
				) {
					throw new TypeError(
						`authPlugin accepts one User schema; ${state.userClassName} is already declared`,
					)
				}
				state.userClassName = className
				const fields = (field: unknown): object => {
					const declared: unknown =
						customFields === undefined
							? {}
							: Reflect.apply(customFields, undefined, [field])
					if (!isPlainRecord(declared)) {
						throw new TypeError(`${className}.fields must return an object`)
					}
					const owned: Readonly<Record<string, unknown>> = Object.fromEntries(
						methods.flatMap((method) =>
							Object.entries(method.userFields?.() ?? {}),
						),
					)
					// The foundation adds the email fields itself, by schema patch.
					const reserved = methods.some((method) => method.userEmail === true)
						? emailFieldNames
						: []
					for (const name of [...Object.keys(owned), ...reserved, 'password']) {
						if (Object.hasOwn(declared, name)) {
							throw new TypeError(`Reserved User field: ${name}`)
						}
					}
					return { ...declared, ...owned }
				}
				return define(
					{
						...declaration,
						className,
						fields,
						[authUserIdentityOptionName]: createAuthUserIdentity(className),
					},
					(schema) => {
						if (!Schema.is(schema)) {
							throw new TypeError('UserSchema declared no schema')
						}
						// The final `.with(...)` class comes last: it is the registered one.
						const user = schema as SchemaReference<string>
						state.user = user
						const services = createStaticsServices(user)
						const methodStatics: Readonly<Record<string, unknown>> =
							Object.fromEntries(
								methods.flatMap((method) =>
									Object.entries(method.statics?.(services) ?? {}),
								),
							)
						return Object.freeze({
							...createUserStatics(user, pluginId),
							...methodStatics,
						})
					},
				)
			},
		})
