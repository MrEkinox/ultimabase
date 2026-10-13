import type {
	ApplicationSchemaMutationManyMethod,
	ApplicationSchemaMutationMethod,
} from '../application/application-schema-mutations.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type {
	IsSchemaRef,
	RegisteredSchema,
} from '../schema/schema/registered-schemas.js'
import type { PluginSchemaMutationDefinition } from './plugin-schema-mutations.js'

declare const pluginSourceSchemaMutationType: unique symbol
declare const pluginSourceSchemaPermissionType: unique symbol

/** Carries exact source-declared schema mutations without adding a runtime property. */
export interface PluginSourceSchemaMutationCarrier<
	TMutations extends Readonly<Record<string, PluginSchemaMutationDefinition>>,
> {
	readonly [pluginSourceSchemaMutationType]: TMutations
}

/** Reads exact source-declared mutations from one configured schema class. */
export type PluginSourceSchemaMutations<TSchema> =
	TSchema extends PluginSourceSchemaMutationCarrier<infer TMutations>
		? TMutations
		: Readonly<Record<never, never>>

/**
 * Types the permissions a statics slot declares on one configured schema
 * (ADR-0317), such as Soft Delete's `readDeleted`, so that policy plugins
 * such as Access accept a rule of the same name without knowing its owner.
 *
 * @example `SchemaCommands<this['schema'], { … }> & SchemaPermissions<'readArchived'>`
 */
export interface SchemaPermissions<TPermission extends string> {
	readonly [pluginSourceSchemaPermissionType]: Readonly<
		Record<TPermission, true>
	>
}

/** Reads the permission names declared on one configured schema class. */
export type PluginSourceSchemaPermissions<TSchema> = TSchema extends {
	readonly [pluginSourceSchemaPermissionType]: infer TPermissions
}
	? keyof TPermissions & string
	: never

/**
 * The schema whose statics carry plugin commands and permissions, for one
 * schema given to a rules slot: a registered `SchemaRef<"Todo">` (ADR-0297)
 * names its schema without its statics, so it reads the registered schema.
 * A schema constant, as `schemaHooks(Post, …)` receives it, is returned
 * as is. Read a `SchemaRef` only from lazy positions such as `.with` rules:
 * it reads the application registry.
 *
 * @example `SchemaMutationAccessMap<SchemaRulesSource<this['schema']>>`
 */
export type SchemaRulesSource<TSchema> =
	IsSchemaRef<TSchema> extends true
		? TSchema extends { readonly className: infer TClassName extends string }
			? [RegisteredSchema<TClassName>] extends [never]
				? TSchema
				: RegisteredSchema<TClassName>
			: TSchema
		: // A schema constant carries its own statics: reading the registry here
			// would type a contributing plugin through the application it joins.
			TSchema

/**
 * Types the commands a statics slot adds to one configured schema (ADR-0316):
 * one method per plugin schema mutation, plus the carrier through which rule
 * plugins such as Access discover request commands without knowing their
 * owner.
 *
 * @example `SchemaCommands<this['schema'], { restoreOne: typeof restoreMutation }>`
 */
export type SchemaCommands<
	TSchema,
	TCommands extends Readonly<Record<string, PluginSchemaMutationDefinition>>,
> = {
	readonly [TName in keyof TCommands]: TCommands[TName] extends Readonly<{
		target: 'many'
	}>
		? ApplicationSchemaMutationManyMethod<
				Extract<TSchema, SchemaDefinition>,
				TCommands[TName]
			>
		: ApplicationSchemaMutationMethod<
				Extract<TSchema, SchemaDefinition>,
				TCommands[TName]
			>
} & PluginSourceSchemaMutationCarrier<TCommands>
