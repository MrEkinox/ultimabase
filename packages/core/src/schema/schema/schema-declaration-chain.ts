import type {
	DeclaredSchemaShape,
	SchemaRulesFor,
	SchemaShapeOf,
	SchemaShapeMethodArguments,
	SchemaShapeMethodRuntime,
	SchemaShapeMethodOptions,
} from '../../plugins/schema-extensions.js'
import type { PluginSourceState } from '../../plugins/source-projections.js'
import type {
	CompleteConfiguredFields,
	ConfiguredSchemaNamespace,
	ConfiguredSchemaResult,
	ConfiguredSchemaRuleOptions,
	ConfiguredSchemaSelectorOptions,
} from './configured-schema-namespace.js'
import {
	defineOrdinarySchemaModel,
	Schema,
	type SchemaDeclaredFields,
	type SchemaFields,
	type SchemaOptions,
} from './definition.js'
import { markSchemaDeclarationMethod } from './declaration-methods.js'
import type {
	SchemaFieldName,
	SchemaIndexInput,
	SchemaRuleIndexOptions,
} from './indexes.js'
import type { SchemaIndexWhere } from './index-predicates.js'
import type { SchemaRulesTarget } from './registered-schemas.js'

/**
 * Indexes accepted by the final `.with(...)`, typed against the complete
 * schema shape, plugin shape fields such as `isDeleted` included (ADR-0303).
 */
export type ConfiguredSchemaIndexRules<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> = Readonly<{
	/**
	 * Declares schema-level indexes, optionally partial.
	 *
	 * @example `indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }]`
	 */
	readonly indexes?: readonly SchemaRuleIndexOptions<
		SchemaFieldName<
			CompleteConfiguredFields<TSource, TClassName, TFields, TOptions>
		>,
		SchemaIndexWhere<
			CompleteConfiguredFields<TSource, TClassName, TFields, TOptions>
		>
	>[]
}>

/** The final rules call of one schema declaration (ADR-0297). */
export interface SchemaRulesMethod<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaFields,
	TOptions extends object,
> {
	/**
	 * Adds the rules of the installed plugins (`access`, `hooks`, ...), typed
	 * against the complete schema. One non-generic call that must stay last:
	 * TypeScript types the schema constant without reading these callbacks, so
	 * schemas may filter each other in both directions.
	 *
	 * @example `.with({ access: { read: { where: ({ where }) => where.eq('archived', false) } } })`
	 */
	with(
		rules: SchemaRulesFor<
			TSource['schemaRules'],
			SchemaRulesTarget<
				ConfiguredSchemaResult<TSource, TClassName, TFields, TOptions>
			>
		> &
			ConfiguredSchemaRuleOptions<TSource, TClassName, TFields, TOptions> &
			ConfiguredSchemaIndexRules<TSource, TClassName, TFields, TOptions>,
	): ConfiguredSchemaResult<TSource, TClassName, TFields, TOptions>
}

// A shape method is unavailable once called, or when the declaration already
// sets the options it would set (`define({ acl: { … } })` for `.acl()`).
type AvailableShapeMethodName<
	TMethods,
	TOptions extends object,
	TUsed extends PropertyKey,
> = {
	[TName in keyof TMethods]: TName extends TUsed
		? never
		: [
					Extract<
						keyof SchemaShapeMethodOptions<TMethods[TName]>,
						keyof TOptions
					>,
			  ] extends [never]
			? TName
			: never
}[keyof TMethods] &
	string

/**
 * Shape methods not called yet. Each one is generic over its arguments, which
 * the chain records in the declaration's shape record for the field and
 * statics slots (ADR-0316); a method never sees the schema, so no cycle.
 */
export type SchemaShapeMethods<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaFields,
	TOptions extends object,
	TUsed extends PropertyKey,
> = {
	readonly [
		TName in AvailableShapeMethodName<TSource['shapeMethods'], TOptions, TUsed>
	]: <
		const TArguments extends SchemaShapeMethodArguments<
			TSource['shapeMethods'][TName]
		>,
	>(
		...arguments_: TArguments
	) => DeclaredSchema<
		TSource,
		TClassName,
		TFields,
		ConfiguredSchemaSelectorOptions<
			TSource,
			TOptions & SchemaShapeMethodOptions<TSource['shapeMethods'][TName]>
		> &
			DeclaredSchemaShape<
				SchemaShapeOf<TOptions> & Readonly<Record<TName, TArguments>>
			>,
		TUsed | TName
	>
}

/** Value of `App.Schema.define(...)` and of each shape method: a usable schema plus its chain. */
export type DeclaredSchema<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaFields,
	TOptions extends object,
	TUsed extends PropertyKey = never,
> = ConfiguredSchemaResult<TSource, TClassName, TFields, TOptions> &
	SchemaShapeMethods<TSource, TClassName, TFields, TOptions, TUsed> &
	SchemaRulesMethod<TSource, TClassName, TFields, TOptions>

type DeclarationOptions = SchemaOptions<string, SchemaFields> &
	Readonly<Record<string, unknown>>

const defineDeclaredSchema = (
	options: DeclarationOptions,
	shapes: ReadonlyMap<string, SchemaShapeMethodRuntime>,
): unknown => {
	const statics: [string, unknown][] = [
		[
			'with',
			markSchemaDeclarationMethod((rules: unknown) => {
				if (typeof rules !== 'object' || rules === null) {
					throw new TypeError('schema rules must be an object')
				}
				// Indexes of `.with` may name fields that plugins add (ADR-0303).
				const { indexes, ...rest }: Readonly<Record<string, unknown>> = {
					...rules,
				}
				if (indexes !== undefined && !Array.isArray(indexes)) {
					throw new TypeError('indexes must be a list')
				}
				return defineOrdinarySchemaModel(
					{ ...options, ...rest },
					{},
					indexes as readonly SchemaIndexInput[] | undefined,
				)
			}),
		],
	]
	for (const [name, method] of shapes) {
		// Same rule as the static type: no method for options already declared.
		if (method.sets.some((key) => Object.hasOwn(options, key))) continue
		const remaining = new Map(shapes)
		remaining.delete(name)
		statics.push([
			name,
			markSchemaDeclarationMethod((...arguments_: readonly unknown[]) =>
				defineDeclaredSchema(
					{ ...options, ...method.apply(...arguments_) },
					remaining,
				),
			),
		])
	}
	return defineOrdinarySchemaModel(options, Object.fromEntries(statics))
}

const configuredSchemaNamespaces = new WeakSet<object>()

/**
 * Checks that one value is a Schema namespace of an UltimaBase factory: the
 * root one, or the one of a factory whose plugins add shape methods.
 */
export const isConfiguredSchemaNamespace = (value: unknown): boolean =>
	typeof value === 'object' &&
	value !== null &&
	configuredSchemaNamespaces.has(value)

/** @internal Creates the schema namespace of one configured factory. */
export const createConfiguredSchemaNamespace = (
	shapes: ReadonlyMap<string, SchemaShapeMethodRuntime>,
): ConfiguredSchemaNamespace => {
	const namespace = Object.freeze({
		define: (options: DeclarationOptions) =>
			defineDeclaredSchema(options, shapes),
		defineSpecialized: Schema.defineSpecialized.bind(Schema),
		is: Schema.is.bind(Schema),
	})
	configuredSchemaNamespaces.add(namespace)
	// The runtime accepts every declaration; the static type comes from the factory's plugins.
	return namespace as unknown as ConfiguredSchemaNamespace
}
