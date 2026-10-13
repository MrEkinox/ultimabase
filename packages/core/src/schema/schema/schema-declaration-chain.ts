import type {
	DeclaredSchemaShape,
	SchemaRulesFor,
	SchemaShapeOf,
	SchemaShapeMethodArguments,
	SchemaShapeMethodRuntime,
} from '../../plugins/schema-extensions.js'
import type { PluginSourceState } from '../../plugins/source-projections.js'
import type {
	CompleteConfiguredFields,
	ConfiguredSchemaNamespace,
	ConfiguredSchemaResult,
} from './configured-schema-namespace.js'
import { assertPlainObject } from '../../exact-object-validation.js'
import {
	defineOrdinarySchemaModel,
	Schema,
	type SchemaDefinition,
	type SchemaDeclaredFields,
	type SchemaFields,
	type SchemaOptions,
} from './definition.js'
import { markSchemaDeclarationMethod } from './declaration-methods.js'
import { assertDeclarationOptionKeys } from './definition-compilation.js'
import type {
	SchemaFieldName,
	SchemaIndexInput,
	SchemaRuleIndexOptions,
} from './indexes.js'
import type { SchemaIndexWhere } from './index-predicates.js'
import type { SchemaRulesTarget } from './registered-schemas.js'
import type { ConfiguredSchemaRelationRules } from './relation-rules.js'

/**
 * Indexes accepted by the final `.with(...)`, typed against the complete
 * schema shape, plugin shape fields such as `isDeleted` included (ADR-0303).
 */
export type ConfiguredSchemaIndexRules<
	TSource extends PluginSourceState,
	TFields extends SchemaDeclaredFields,
	TOptions extends object,
> = Readonly<{
	/**
	 * Declares schema-level indexes, optionally partial.
	 *
	 * @example `indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }]`
	 */
	readonly indexes?: readonly SchemaRuleIndexOptions<
		SchemaFieldName<CompleteConfiguredFields<TSource, TFields, TOptions>>,
		SchemaIndexWhere<CompleteConfiguredFields<TSource, TFields, TOptions>>
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
			>,
			SchemaShapeOf<TOptions>
		> &
			ConfiguredSchemaIndexRules<TSource, TFields, TOptions> &
			ConfiguredSchemaRelationRules<TFields>,
	): ConfiguredSchemaResult<TSource, TClassName, TFields, TOptions>
}

// A shape method is unavailable once called.
type AvailableShapeMethodName<TMethods, TUsed extends PropertyKey> = Exclude<
	keyof TMethods,
	TUsed
> &
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
		TName in AvailableShapeMethodName<TSource['shapeMethods'], TUsed>
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

type DeclarationStatics = (
	schema: SchemaDefinition,
) => Readonly<Record<string, unknown>>

const defineDeclaredSchema = (
	options: DeclarationOptions,
	shapes: ReadonlyMap<string, SchemaShapeMethodRuntime>,
	statics?: DeclarationStatics,
): unknown => {
	const chain: [string, unknown][] = [
		[
			'with',
			markSchemaDeclarationMethod((rules: unknown) => {
				if (typeof rules !== 'object' || rules === null) {
					throw new TypeError('schema rules must be an object')
				}
				// Indexes of `.with` may name fields that plugins add (ADR-0303);
				// relation filters join their relation field (ADR-0328).
				const {
					indexes,
					relations,
					...rest
				}: Readonly<Record<string, unknown>> = { ...rules }
				if (indexes !== undefined && !Array.isArray(indexes)) {
					throw new TypeError('indexes must be a list')
				}
				return defineOrdinarySchemaModel(
					{ ...options, ...rest },
					{},
					{
						indexes: indexes as readonly SchemaIndexInput[] | undefined,
						relations,
					},
					statics,
				)
			}),
		],
	]
	for (const [name, method] of shapes) {
		const remaining = new Map(shapes)
		remaining.delete(name)
		chain.push([
			name,
			markSchemaDeclarationMethod((...arguments_: readonly unknown[]) =>
				defineDeclaredSchema(
					{ ...options, ...method.apply(...arguments_) },
					remaining,
					statics,
				),
			),
		])
	}
	return defineOrdinarySchemaModel(
		options,
		Object.fromEntries(chain),
		undefined,
		statics,
	)
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

/**
 * @internal Starts one declaration of a configured factory for a plugin
 * schema factory (ADR-0322): the same chain as `App.Schema.define`, with
 * `statics` bound to every class it creates.
 */
export const defineFactorySchema = (
	shapes: ReadonlyMap<string, SchemaShapeMethodRuntime>,
	options: object,
	statics: DeclarationStatics | undefined,
): unknown => {
	assertPlainObject(options, 'schema options must be an object')
	if (statics !== undefined && typeof statics !== 'function') {
		throw new TypeError('schema factory statics must be a function')
	}
	return defineDeclaredSchema(options as DeclarationOptions, shapes, statics)
}

/** @internal Creates the schema namespace of one configured factory. */
export const createConfiguredSchemaNamespace = (
	shapes: ReadonlyMap<string, SchemaShapeMethodRuntime>,
): ConfiguredSchemaNamespace => {
	const namespace = Object.freeze({
		define: (options: DeclarationOptions) => {
			assertPlainObject(options, 'schema options must be an object')
			assertDeclarationOptionKeys(options)
			return defineDeclaredSchema(options, shapes)
		},
		defineSpecialized: Schema.defineSpecialized.bind(Schema),
		is: Schema.is.bind(Schema),
	})
	configuredSchemaNamespaces.add(namespace)
	// The static type of the chain comes from the factory's plugins.
	return namespace as unknown as ConfiguredSchemaNamespace
}
