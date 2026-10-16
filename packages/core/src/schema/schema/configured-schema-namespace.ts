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
import type { UniqueIndexFields } from './source-unique-targets.js'
import type {
	CompleteDefineFields,
	DefineFeatureCheck,
	DefineFeatureNames,
	DefineFeatureOptions,
	DefineFeatures,
	DefineFeaturesNotInferred,
	DefineUniqueIndexFields,
} from './define-features.js'
import type { ConfiguredFieldBuilder } from './field-builder-contract.js'
import type { ReservedSchemaFieldCollision } from './reserved-field-names.js'
import type {
	SchemaFieldName,
	SchemaIndexOptions,
	SchemaRuleIndexOptions,
} from './indexes.js'
import type { SchemaIndexWhere } from './index-predicates.js'
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
	TUniqueIndexes extends UniqueIndexFields,
> = SourceSchemaTypeInfo<
	TClassName,
	CompleteConfiguredFields<TSource, TFields, TOptions>,
	TUniqueIndexes
>

/** One configured schema: its reference plus the statics of the installed plugins. */
export type ConfiguredSchemaResult<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
	TUniqueIndexes extends UniqueIndexFields = never,
> = SchemaReference<
	TClassName,
	CompleteConfiguredFields<TSource, TFields, TOptions>,
	TUniqueIndexes
> &
	SchemaStaticsFor<
		TSource['schemaStatics'],
		SchemaShapeOf<TOptions>,
		SchemaClass<
			ConfiguredSchemaContract<
				TSource,
				TClassName,
				TFields,
				TOptions,
				TUniqueIndexes
			>
		>
	>

/**
 * One index of `define`, typed against the complete fields, those of the
 * features set beside it included (`isDeleted`).
 */
export type ConfiguredSchemaIndex<TFields extends object> =
	SchemaRuleIndexOptions<SchemaFieldName<TFields>, SchemaIndexWhere<TFields>>

/**
 * The options of `App.Schema.define(...)`: what the schema is, with static
 * values only (ADR-0339). Rules go to the final `.with`.
 */
export type ConfiguredSchemaDeclarationOptions<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaFields,
	TIndexes = readonly SchemaIndexOptions<SchemaFieldName<TFields>>[],
> = Omit<SchemaOptions<TClassName, TFields>, 'fields' | 'indexes'> &
	Readonly<{
		/**
		 * Declares adapter-neutral schema-level indexes over the complete
		 * fields, those of the features set in `define` included. Plain
		 * single-field indexes belong on the field through `indexed`. A unique
		 * index without `where` is a unique target of `updateOne`, `deleteOne`
		 * and `upsertOne` (ADR-0332); a partial one only enforces uniqueness
		 * among the rows its `where` matches.
		 *
		 * @example `indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }]`
		 */
		readonly indexes?: TIndexes
	}> &
	Readonly<{
		/**
		 * Declares fields by returning one exact map from the canonical factory builder.
		 * Framework-owned `id`, `createdAt`, and `updatedAt` fields are added automatically.
		 *
		 * @example `fields: (field) => ({ title: field.string(), published: field.boolean() })`
		 */
		fields: ConfiguredFieldDeclaration<TSource, TClassName, TFields>
	}> &
	DefineFeatures<TSource> &
	ReservedSchemaFieldCollision<NoInfer<TFields>>

/** Exposes exact source inference through the one configured application namespace. */
export type ConfiguredSchemaNamespace<
	TSource extends PluginSourceState = EmptyPluginSourceState,
> = Pick<typeof Schema, 'is' | 'defineSpecialized'> &
	Readonly<{
		/**
		 * Defines one final schema with typed static commands and QueryBuilder access.
		 * `define` describes what the schema is (`className`, `fields`,
		 * `indexes` and the feature keys of the installed plugins, such as
		 * `softDelete: true`); end with `.with((plugins) => …)` to configure
		 * how each plugin treats it (ADR-0339).
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
			// The whole options object, captured once: its feature keys and
			// indexes are checked against it (ADR-0339).
			const TFeatures extends DefineFeatureCheck<TSource, TFields, TFeatures> =
				DefineFeaturesNotInferred,
		>(
			options: ConfiguredSchemaDeclarationOptions<
				TSource,
				TClassName,
				TFields,
				readonly ConfiguredSchemaIndex<
					CompleteDefineFields<TSource, TFields, TFeatures>
				>[]
			> &
				TFeatures,
		) => DeclaredSchema<
			TSource,
			TClassName,
			TFields,
			DefineFeatureOptions<TSource, TFeatures>,
			DefineFeatureNames<TSource, TFeatures>,
			DefineUniqueIndexFields<TFeatures>
		>
	}>
