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
import type {
	DeclaredUniqueIndexFields,
	UniqueIndexFields,
} from './source-unique-targets.js'
import type { ConfiguredFieldBuilder } from './field-builder-contract.js'
import type { ReservedSchemaFieldCollision } from './reserved-field-names.js'
import type { SchemaFieldName, SchemaIndexOptions } from './indexes.js'
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

declare const unknownIndexOption: unique symbol

/** Refuses the capture of an index entry naming an unknown option. */
interface KnownIndexOptionsOnly {
	readonly [unknownIndexOption]: true
}

type DeclaredSchemaIndex<TFields extends SchemaFields> = SchemaIndexOptions<
	SchemaFieldName<NoInfer<TFields>>
>

/**
 * The `indexes` of `define`, captured exactly since its unique indexes are
 * unique targets (ADR-0332). An entry naming an unknown option fails the
 * capture, so it is still reported as an unknown property.
 */
export type DeclaredSchemaIndexes<
	TFields extends SchemaFields,
	TIndexes,
> = readonly unknown[] & {
	readonly [TIndex in keyof TIndexes]: [
		Exclude<keyof TIndexes[TIndex], keyof SchemaIndexOptions>,
	] extends [never]
		? DeclaredSchemaIndex<TFields>
		: DeclaredSchemaIndex<TFields> & KnownIndexOptionsOnly
}

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

/** The options of `App.Schema.define(...)`: data only, rules go to `.with` (ADR-0297). */
export type ConfiguredSchemaDeclarationOptions<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaFields,
	TIndexes extends DeclaredSchemaIndexes<TFields, TIndexes> =
		readonly SchemaIndexOptions<SchemaFieldName<TFields>>[],
> = Omit<SchemaOptions<TClassName, TFields>, 'fields' | 'indexes'> &
	Readonly<{
		/**
		 * Declares adapter-neutral schema-level indexes. Plain single-field indexes
		 * belong on the field through `indexed`; partial indexes, whose `where`
		 * sees every field, are declared in the final `.with` (ADR-0303). A unique
		 * index is a unique target of `updateOne`, `deleteOne` and `upsertOne`
		 * (ADR-0332).
		 *
		 * @example `indexes: [{ fields: ["authorId", "createdAt"] }]`
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
			const TIndexes extends DeclaredSchemaIndexes<TFields, TIndexes> =
				readonly [],
		>(
			options: ConfiguredSchemaDeclarationOptions<
				TSource,
				TClassName,
				TFields,
				TIndexes
			>,
		) => DeclaredSchema<
			TSource,
			TClassName,
			TFields,
			Readonly<Record<never, never>>,
			never,
			DeclaredUniqueIndexFields<TIndexes>
		>
	}>
