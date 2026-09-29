import type {
	EmptyPluginSourceState,
	PluginSourceState,
	ResolvePluginSchemaProjection,
} from '../../plugins/source-projections.js'
import type { SchemaTypeInfoByNameOrBase } from '../type-info.js'
import type { SourceSchemaTypeInfo } from './source-type-info.js'
import type { ConfiguredFieldBuilder } from './source-field-builder-contract.js'
import type { ReservedSchemaFieldCollision } from './reserved-field-names.js'
import type { SchemaResultCapabilityCarrier } from './model.js'
import type {
	Schema,
	SchemaDeclaredFields,
	SchemaFields,
	SchemaOptions,
	SchemaReference,
} from './definition.js'

type ConfiguredFieldDeclaration<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
> = (
	field: ConfiguredFieldBuilder<
		TSource,
		SchemaTypeInfoByNameOrBase<TClassName>
	>,
) => TFields

type ConfiguredSourceFields<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> =
	ResolvePluginSchemaProjection<
		TSource['schemaFields'],
		SourceSchemaTypeInfo<TClassName, TFields>,
		TOptions
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

type ConfiguredSchemaResult<
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
		TOptions
	> &
	SchemaResultCapabilityCarrier<
		ResolvePluginSchemaProjection<
			TSource['model'],
			ConfiguredSchemaContract<TSource, TClassName, TFields, TOptions>,
			TOptions
		>
	>

type ConfiguredSchemaOptions<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
> = Omit<SchemaOptions<TClassName, TFields>, 'fields'> &
	ResolvePluginSchemaProjection<
		TSource['schemaOptions'],
		ConfiguredSchemaContract<
			TSource,
			TClassName,
			TFields,
			Readonly<Record<never, never>>
		>
	> &
	Readonly<{
		fields: ConfiguredFieldDeclaration<TSource, TClassName, TFields>
	}>

/** Exposes exact source inference through the one configured application namespace. */
export type ConfiguredSchemaNamespace<
	TSource extends PluginSourceState = EmptyPluginSourceState,
> = Omit<typeof Schema, 'define'> &
	Readonly<{
		define: <
			const TClassName extends string,
			const TFields extends SchemaFields,
			const TDeclaredOptions extends object,
		>(
			options: ConfiguredSchemaOptions<TSource, TClassName, TFields> &
				TDeclaredOptions &
				(Exclude<
					keyof TDeclaredOptions,
					keyof ConfiguredSchemaOptions<TSource, TClassName, TFields>
				> extends never
					? unknown
					: never) &
				ReservedSchemaFieldCollision<NoInfer<TFields>>,
		) => ConfiguredSchemaResult<TSource, TClassName, TFields, TDeclaredOptions>
	}>
