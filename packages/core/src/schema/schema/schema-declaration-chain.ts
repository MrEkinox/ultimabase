import type {
	SchemaRulesFor,
	SchemaShapeMethodArguments,
	SchemaShapeMethodRuntime,
	SchemaShapeMethodOptions,
} from '../../plugins/schema-extensions.js'
import type { PluginSourceState } from '../../plugins/source-projections.js'
import type {
	ConfiguredSchemaNamespace,
	ConfiguredSchemaResult,
	ConfiguredSchemaRuleOptions,
	ConfiguredSchemaSelectorOptions,
} from './configured-schema-namespace.js'
import {
	defineOrdinarySchemaModel,
	Schema,
	type SchemaFields,
	type SchemaOptions,
} from './definition.js'
import type { SchemaRulesTarget } from './registered-schemas.js'

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
			ConfiguredSchemaRuleOptions<TSource, TClassName, TFields, TOptions>,
	): ConfiguredSchemaResult<TSource, TClassName, TFields, TOptions>
}

// A shape method is unavailable once called, or when the declaration already
// sets the options it would set (`define({ softDelete: 'explicit' })`).
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

/** Shape methods not called yet; each one is a single non-generic signature. */
export type SchemaShapeMethods<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaFields,
	TOptions extends object,
	TUsed extends PropertyKey,
> = {
	readonly [
		TName in AvailableShapeMethodName<TSource['shapeMethods'], TOptions, TUsed>
	]: (
		...arguments_: SchemaShapeMethodArguments<TSource['shapeMethods'][TName]>
	) => DeclaredSchema<
		TSource,
		TClassName,
		TFields,
		ConfiguredSchemaSelectorOptions<
			TSource,
			TOptions & SchemaShapeMethodOptions<TSource['shapeMethods'][TName]>
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
			(rules: unknown) => {
				if (typeof rules !== 'object' || rules === null) {
					throw new TypeError('schema rules must be an object')
				}
				return defineOrdinarySchemaModel({ ...options, ...rules })
			},
		],
	]
	for (const [name, method] of shapes) {
		// Same rule as the static type: no method for options already declared.
		if (method.sets.some((key) => Object.hasOwn(options, key))) continue
		const remaining = new Map(shapes)
		remaining.delete(name)
		statics.push([
			name,
			(...arguments_: readonly unknown[]) =>
				defineDeclaredSchema(
					{ ...options, ...method.apply(...arguments_) },
					remaining,
				),
		])
	}
	return defineOrdinarySchemaModel(options, Object.fromEntries(statics))
}

/** @internal Creates the schema namespace of one configured factory. */
export const createConfiguredSchemaNamespace = (
	shapes: ReadonlyMap<string, SchemaShapeMethodRuntime>,
): ConfiguredSchemaNamespace =>
	// The runtime accepts every declaration; the static type comes from the factory's plugins.
	Object.freeze({
		define: (options: DeclarationOptions) =>
			defineDeclaredSchema(options, shapes),
		defineSpecialized: Schema.defineSpecialized.bind(Schema),
		is: Schema.is.bind(Schema),
	}) as unknown as ConfiguredSchemaNamespace
