import type {
	EmptyPluginSourceState,
	PluginSourceState,
} from '../../plugins/source-projections.js'
import type {
	SchemaFieldsFor,
	SchemaShapeOf,
	SchemaStaticsFor,
} from '../../plugins/schema-extensions.js'
import type { BaseSchemaTypeInfo } from '../type-info.js'
import type { SourceSchemaTypeInfo } from './source-type-info.js'
import type { DeclaredSchema } from './schema-declaration-chain.js'
import type { ConfiguredFieldBuilder } from './field-builder-contract.js'
import type { ReservedSchemaFieldCollision } from './reserved-field-names.js'
import type {
	Schema,
	SchemaClass,
	SchemaDeclaredFields,
	SchemaFields,
	SchemaOptions,
	SchemaReference,
} from './definition.js'

export type ConfiguredFieldDeclaration<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
> = (
	field: ConfiguredFieldBuilder<TSource, BaseSchemaTypeInfo<TClassName>>,
) => TFields

/** The developer and plugin shape fields of one configured schema. */
export type CompleteConfiguredFields<
	TSource extends PluginSourceState,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> = Readonly<
	TFields & SchemaFieldsFor<TSource['shapeFields'], SchemaShapeOf<TOptions>>
>

type ConfiguredSchemaContract<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> = SourceSchemaTypeInfo<
	TClassName,
	CompleteConfiguredFields<TSource, TFields, TOptions>
>

/** One configured schema: its reference plus the statics of the installed plugins. */
export type ConfiguredSchemaResult<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> = SchemaReference<
	TClassName,
	CompleteConfiguredFields<TSource, TFields, TOptions>
> &
	SchemaStaticsFor<
		TSource['schemaStatics'],
		SchemaShapeOf<TOptions>,
		SchemaClass<
			ConfiguredSchemaContract<TSource, TClassName, TFields, TOptions>
		>
	>

/** The options of `App.Schema.define(...)`: data only, rules go to `.with` (ADR-0297). */
export type ConfiguredSchemaDeclarationOptions<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaFields,
> = Omit<SchemaOptions<TClassName, TFields>, 'fields'> &
	Readonly<{
		/**
		 * Declares fields by returning one exact map from the canonical factory builder.
		 * Framework-owned `id`, `createdAt`, and `updatedAt` fields are added automatically.
		 *
		 * @example `fields: (field) => ({ title: field.string(), published: field.boolean() })`
		 */
		fields: ConfiguredFieldDeclaration<TSource, TClassName, TFields>
	}> &
	ReservedSchemaFieldCollision<NoInfer<TFields>>

/** Exposes exact source inference through the one configured application namespace. */
export type ConfiguredSchemaNamespace<
	TSource extends PluginSourceState = EmptyPluginSourceState,
> = Pick<typeof Schema, 'is' | 'defineSpecialized'> &
	Readonly<{
		/**
		 * Defines one final schema with typed static commands and QueryBuilder access.
		 * Chain the shape methods of the installed plugins, then end with
		 * `.with({ ...rules })` (ADR-0297).
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
		>(
			options: ConfiguredSchemaDeclarationOptions<TSource, TClassName, TFields>,
		) => DeclaredSchema<
			TSource,
			TClassName,
			TFields,
			Readonly<Record<never, never>>
		>
	}>
