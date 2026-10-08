import type {
	EmptyPluginSourceState,
	PluginSourceState,
	ResolvePluginSchemaProjection,
} from '../../plugins/source-projections.js'
import type {
	PluginSourceSchemaMutationCarrier,
	PluginSourceSchemaMutations,
} from '../../plugins/source-schema-templates.js'
import type {
	SchemaTypeInfoByNameOrBase,
	SchemaTypeInfoCarrier,
	UltimaBaseGeneratedSchemas,
} from '../type-info.js'
import type { SourceSchemaTypeInfo } from './source-type-info.js'
import type { ConfiguredFieldBuilder } from './field-builder-contract.js'
import type { ReservedSchemaFieldCollision } from './reserved-field-names.js'
import type { SchemaResultCapabilityCarrier } from './model-contracts.js'
import type {
	Schema,
	SchemaDeclaredFields,
	SchemaDefinition,
	SchemaFields,
	SchemaOptions,
	SchemaReference,
} from './definition.js'

export type ConfiguredFieldDeclaration<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
> = (
	field: ConfiguredFieldBuilder<
		TSource,
		SchemaTypeInfoByNameOrBase<TClassName>
	>,
) => TFields

type SchemaFieldOptionSelector<TProjection> =
	TProjection extends Readonly<{
		selector: Readonly<{ option: infer TOption }>
	}>
		? TOption
		: never

type SchemaFieldSelectorOptionName<TSource extends PluginSourceState> =
	SchemaFieldOptionSelector<
		TSource['model'] | TSource['schemaClass'] | TSource['schemaFields']
	> extends infer TOption
		? TOption extends Readonly<{ name: infer TName extends PropertyKey }>
			? TName
			: never
		: never

type SchemaFieldEqualityOptionName<TSource extends PluginSourceState> =
	SchemaFieldOptionSelector<
		TSource['model'] | TSource['schemaClass'] | TSource['schemaFields']
	> extends infer TOption
		? TOption extends Readonly<{
				equals: unknown
				name: infer TName extends PropertyKey
			}>
			? TName
			: never
		: never

type ConfiguredSchemaSelectorOptions<
	TSource extends PluginSourceState,
	TOptions extends object,
> = Readonly<{
	[
		TName in Extract<SchemaFieldSelectorOptionName<TSource>, keyof TOptions>
	]: TName extends SchemaFieldEqualityOptionName<TSource>
		? TOptions[TName]
		: unknown
}>

type ConfiguredSourceFields<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> =
	ResolvePluginSchemaProjection<
		TSource['schemaFields'],
		SourceSchemaTypeInfo<TClassName, TFields>,
		ConfiguredSchemaSelectorOptions<TSource, TOptions>
	> extends infer TAdded
		? TAdded extends SchemaDeclaredFields
			? TAdded
			: Readonly<Record<never, never>>
		: Readonly<Record<never, never>>

type CompleteConfiguredFields<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> = Readonly<
	TFields & ConfiguredSourceFields<TSource, TClassName, TFields, TOptions>
>

type ConfiguredSchemaContract<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> = SourceSchemaTypeInfo<
	TClassName,
	CompleteConfiguredFields<TSource, TClassName, TFields, TOptions>
>

type ConfiguredSchemaAuthoringContract<TClassName extends string> =
	SchemaTypeInfoByNameOrBase<TClassName>

type ConfiguredSchemaClassSurface<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> = SchemaReference<
	TClassName,
	CompleteConfiguredFields<TSource, TClassName, TFields, TOptions>
> &
	ResolvePluginSchemaProjection<
		TSource['schemaClass'],
		ConfiguredSchemaContract<TSource, TClassName, TFields, TOptions>,
		ConfiguredSchemaSelectorOptions<TSource, TOptions>
	>

type ConfiguredSourceSchemaMutations<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> = PluginSourceSchemaMutations<
	ResolvePluginSchemaProjection<
		TSource['schemaClass'],
		ConfiguredSchemaContract<TSource, TClassName, TFields, TOptions>,
		ConfiguredSchemaSelectorOptions<TSource, TOptions>,
		SchemaDefinition<
			TClassName,
			CompleteConfiguredFields<TSource, TClassName, TFields, TOptions>
		>
	>
>

type ConfiguredSchemaAuthoringSurface<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> = SchemaDefinition<
	TClassName,
	CompleteConfiguredFields<TSource, TClassName, TFields, TOptions>
> &
	SchemaTypeInfoCarrier<ConfiguredSchemaAuthoringContract<TClassName>> &
	PluginSourceSchemaMutationCarrier<
		ConfiguredSourceSchemaMutations<TSource, TClassName, TFields, TOptions>
	>

export type ConfiguredSchemaResult<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> = ConfiguredSchemaClassSurface<TSource, TClassName, TFields, TOptions> &
	SchemaResultCapabilityCarrier<
		ResolvePluginSchemaProjection<
			TSource['model'],
			ConfiguredSchemaContract<TSource, TClassName, TFields, TOptions>,
			ConfiguredSchemaSelectorOptions<TSource, TOptions>
		>
	>

type ConfiguredSourceSchemaOptions<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TDeclaredOptions extends object,
> = ResolvePluginSchemaProjection<
	TSource['schemaOptions'],
	ConfiguredSchemaAuthoringContract<TClassName>,
	TDeclaredOptions,
	ConfiguredSchemaAuthoringSurface<
		TSource,
		TClassName,
		TFields,
		ConfiguredSchemaSelectorOptions<TSource, TDeclaredOptions>
	>
>

type KeysOfUnion<TValue> = TValue extends unknown ? keyof TValue : never

type UnionValueAtKey<TValue, TKey extends PropertyKey> = TValue extends unknown
	? TKey extends keyof TValue
		? TValue[TKey]
		: never
	: never

type RemainingDepth<TDepth extends readonly unknown[]> =
	TDepth extends readonly [unknown, ...infer TRest] ? TRest : readonly []

type ValidateDeclaredSourceValue<
	TDeclared,
	TExpected,
	TDepth extends readonly unknown[],
> = TDepth extends readonly []
	? TDeclared
	: TDeclared extends (...arguments_: never[]) => unknown
		? TDeclared
		: TDeclared extends readonly unknown[]
			? TDeclared
			: TDeclared extends object
				? {
						readonly [TKey in keyof TDeclared]: TKey extends KeysOfUnion<
							NonNullable<TExpected>
						>
							? ValidateDeclaredSourceValue<
									TDeclared[TKey],
									UnionValueAtKey<NonNullable<TExpected>, TKey>,
									RemainingDepth<TDepth>
								>
							: never
					}
				: TDeclared

type ConfiguredDeclaredOptionValidation<
	TDeclaredOptions extends object,
	TSourceOptions extends object,
> = {
	readonly [
		TName in keyof TDeclaredOptions as TName extends keyof TSourceOptions
			? TName
			: never
	]: ValidateDeclaredSourceValue<
		TDeclaredOptions[TName],
		TName extends keyof TSourceOptions ? TSourceOptions[TName] : never,
		readonly [unknown, unknown, unknown, unknown, unknown, unknown]
	>
}

export type ConfiguredSchemaOptionsForDeclaration<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFieldDeclaration extends ConfiguredFieldDeclaration<
		TSource,
		TClassName,
		SchemaDeclaredFields
	>,
	TBaseFields extends SchemaDeclaredFields = ReturnType<TFieldDeclaration>,
> = Omit<
	SchemaOptions<TClassName, TBaseFields>,
	| 'fields'
	| keyof ConfiguredSourceSchemaOptions<
			TSource,
			TClassName,
			TBaseFields,
			Readonly<Record<never, never>>
	  >
> &
	ConfiguredSourceSchemaOptions<
		TSource,
		TClassName,
		TBaseFields,
		Readonly<Record<never, never>>
	> &
	Readonly<{ fields: TFieldDeclaration }>

type ConfiguredSchemaOptionValidationSource<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFieldDeclaration extends ConfiguredFieldDeclaration<
		TSource,
		TClassName,
		SchemaDeclaredFields
	>,
	TDeclaredOptions extends object,
	TBaseFields extends SchemaDeclaredFields,
> = TClassName extends keyof UltimaBaseGeneratedSchemas
	? ConfiguredSchemaOptionsForDeclaration<
			TSource,
			TClassName,
			TFieldDeclaration,
			TBaseFields
		>
	: ConfiguredSourceSchemaOptions<
			TSource,
			TClassName,
			TBaseFields,
			TDeclaredOptions
		>

/** Validates one package-specialized declaration through the configured source graph. */
export type ConfiguredSchemaDeclarationOptions<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFieldDeclaration extends ConfiguredFieldDeclaration<
		TSource,
		TClassName,
		SchemaDeclaredFields
	>,
	TDeclaredOptions extends object,
	TBaseFields extends SchemaDeclaredFields = ReturnType<TFieldDeclaration>,
> = Readonly<{ className: TClassName }> &
	ConfiguredSchemaOptionsForDeclaration<
		TSource,
		TClassName,
		TFieldDeclaration,
		TBaseFields
	> &
	TDeclaredOptions &
	ConfiguredDeclaredOptionValidation<
		TDeclaredOptions,
		ConfiguredSchemaOptionValidationSource<
			TSource,
			TClassName,
			TFieldDeclaration,
			TDeclaredOptions,
			TBaseFields
		>
	> &
	(Exclude<
		keyof TDeclaredOptions,
		keyof ConfiguredSchemaOptionsForDeclaration<
			TSource,
			TClassName,
			TFieldDeclaration,
			TBaseFields
		>
	> extends never
		? unknown
		: never) &
	ReservedSchemaFieldCollision<NoInfer<TBaseFields>>

/** Exposes exact source inference through the one configured application namespace. */
export type ConfiguredSchemaNamespace<
	TSource extends PluginSourceState = EmptyPluginSourceState,
> = Pick<typeof Schema, 'is' | 'defineSpecialized'> &
	Readonly<{
		/**
		 * Defines one final schema-specific class with typed drafts and QueryBuilder access.
		 * The configured application projects its installed plugin fields and options here.
		 *
		 * @example
		 * ```ts
		 * const Post = App.Schema.define({
		 *   className: 'Post',
		 *   fields: (field) => ({ title: field.string({ required: true }) }),
		 * })
		 * ```
		 */
		define: <
			const TClassName extends string,
			const TFields extends SchemaFields,
			const TDeclaredOptions extends object,
		>(
			options: ConfiguredSchemaDeclarationOptions<
				TSource,
				TClassName,
				ConfiguredFieldDeclaration<TSource, TClassName, TFields>,
				TDeclaredOptions
			>,
		) => ConfiguredSchemaResult<
			TSource,
			TClassName,
			TFields,
			ConfiguredSchemaSelectorOptions<TSource, TDeclaredOptions>
		>
	}>
