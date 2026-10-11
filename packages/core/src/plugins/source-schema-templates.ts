import type {
	ApplicationSchemaMutationManyMethod,
	ApplicationSchemaMutationMethod,
} from '../application/application-schema-mutations.js'
import type {
	FieldSourceOpaque,
	FieldSourceValue,
	GenericField,
} from '../schema/fields/base/contract.js'
import type {
	SchemaClass,
	SchemaDefinition,
} from '../schema/schema/definition.js'
import type { SchemaItem } from '../schema/schema/values.js'
import type { RegisteredSchema } from '../schema/schema/registered-schemas.js'
import type { SchemaTypeInfo } from '../schema/type-info.js'
import type { PluginSchemaMutationDefinition } from './plugin-schema-mutations.js'

declare const pluginSourceMutationMethodType: unique symbol
declare const pluginSourceSchemaMutationType: unique symbol
declare const pluginSourceSchemaFieldValuesType: unique symbol
declare const pluginSourceSchemaPermissionType: unique symbol

/** Marks persisted developer-field values without Core system fields. */
export interface PluginSourceSchemaFieldValues<
	TExcluded extends string = never,
> {
	readonly [pluginSourceSchemaFieldValuesType]: TExcluded
}

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
 * Read it only from lazy positions such as `.with` rules: it reads the
 * application registry.
 *
 * @example `SchemaMutationAccessMap<SchemaRulesSource<this['schema']>>`
 */
export type SchemaRulesSource<TSchema> = TSchema extends {
	readonly className: infer TClassName extends string
}
	? [RegisteredSchema<TClassName>] extends [never]
		? TSchema
		: RegisteredSchema<TClassName>
	: TSchema

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

/** Defers one mutation method until the configured schema contract is known. */
export interface PluginSourceMutationMethod<
	TMutation extends PluginSchemaMutationDefinition,
> {
	readonly [pluginSourceMutationMethodType]: Readonly<{
		readonly mutation: TMutation
	}>
}

/** Resolves one plugin template against an exact configured schema contract. */
export type ResolveSourceSchemaTemplate<
	TTemplate,
	TContract extends SchemaTypeInfo,
	TSchema extends SchemaDefinition,
> = TTemplate extends GenericField
	? TTemplate
	: TTemplate extends FieldSourceOpaque<infer TValue>
		? TValue
		: TTemplate extends PluginSourceSchemaFieldValues<infer TExcluded>
			? Readonly<
					Pick<
						SchemaItem<TSchema>,
						Extract<
							Exclude<
								TContract['persistedFields'],
								'id' | 'createdAt' | 'updatedAt' | TExcluded
							>,
							keyof SchemaItem<TSchema>
						>
					>
				>
			: TTemplate extends FieldSourceValue
				? never
				: TTemplate extends PluginSourceMutationMethod<infer TMutation>
					? ApplicationSchemaMutationMethod<SchemaClass<TContract>, TMutation>
					: TTemplate extends (...arguments_: infer TArguments) => infer TResult
						? (
								...arguments_: {
									[TIndex in keyof TArguments]: ResolveSourceSchemaTemplate<
										TArguments[TIndex],
										TContract,
										TSchema
									>
								}
							) => ResolveSourceSchemaTemplate<TResult, TContract, TSchema>
						: TTemplate extends Promise<infer TResult>
							? Promise<
									ResolveSourceSchemaTemplate<TResult, TContract, TSchema>
								>
							: TTemplate extends PromiseLike<infer TResult>
								? PromiseLike<
										ResolveSourceSchemaTemplate<TResult, TContract, TSchema>
									>
								: TTemplate extends readonly (infer TEntry)[]
									? readonly ResolveSourceSchemaTemplate<
											TEntry,
											TContract,
											TSchema
										>[]
									: TTemplate extends object
										? ResolveSourceSchemaObject<TTemplate, TContract, TSchema>
										: TTemplate

/**
 * Resolves one object template member by member. Declared outside the
 * conditional above on purpose: a mapped type written inside conditional
 * branches captures their unresolved `infer` parameters, which makes every
 * schema type containing it look generic. TypeScript then re-instantiates whole
 * schemas when a relationship target thunk is resolved (TS2589 on self relations).
 * The `infer` here only rebinds the template itself, so nothing else is
 * captured, and a resolved conditional carries no alias: editors print the
 * resolved object instead of `ResolveSourceSchemaObject<…>` with whole schema
 * arguments (about 0.1 s of checking, measured in migration step 5).
 */
type ResolveSourceSchemaObject<
	TTemplate,
	TContract extends SchemaTypeInfo,
	TSchema extends SchemaDefinition,
> = TTemplate extends infer TObject
	? {
			readonly [TKey in keyof TObject]: ResolveSourceSchemaTemplate<
				TObject[TKey],
				TContract,
				TSchema
			>
		}
	: never
