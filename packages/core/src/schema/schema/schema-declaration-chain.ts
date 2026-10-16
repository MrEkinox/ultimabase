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
import type { UniqueIndexFields } from './source-unique-targets.js'
import type {
	DefinedFeatureForm,
	RequiredSchemaRuleName,
} from './define-features.js'
import {
	collectSchemaRules,
	type SchemaRulesCallback,
} from './schema-rules-builder.js'

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

declare const requiredSchemaRules: unique symbol

/**
 * The final rules call of one schema declaration (ADR-0297, ADR-0339), with
 * the rules its features require, read by `new App({ schemas })` when the
 * declaration ends without it.
 */
export interface SchemaRulesMethod<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaFields,
	TOptions extends object,
	TUniqueIndexes extends UniqueIndexFields = never,
> {
	/**
	 * Configures how each installed plugin treats the schema, typed against
	 * the complete schema: `(plugins) => plugins.access({ … }).hooks({ … })`,
	 * one method per rule, each callable once. One non-generic call that must
	 * stay last: TypeScript types the schema constant without reading these
	 * callbacks, so schemas may filter each other in both directions. The
	 * object form `.with({ access: { … } })` is accepted until its removal,
	 * except after a `define` that sets feature keys.
	 *
	 * @example `.with((plugins) => plugins.access({ read: ({ where }) => where.eq('archived', false) }))`
	 */
	with(
		rules: TOptions extends DefinedFeatureForm
			? SchemaRulesCallback<
					SchemaRulesFor<
						TSource['schemaRules'],
						SchemaRulesTarget<
							ConfiguredSchemaResult<
								TSource,
								TClassName,
								TFields,
								TOptions,
								TUniqueIndexes
							>
						>,
						SchemaShapeOf<TOptions>
					> &
						ConfiguredSchemaRelationRules<TFields>,
					RequiredSchemaRuleName<TSource, SchemaShapeOf<TOptions>>
				>
			: | (SchemaRulesFor<
						TSource['schemaRules'],
						SchemaRulesTarget<
							ConfiguredSchemaResult<
								TSource,
								TClassName,
								TFields,
								TOptions,
								TUniqueIndexes
							>
						>,
						SchemaShapeOf<TOptions>
				  > &
						ConfiguredSchemaIndexRules<TSource, TFields, TOptions> &
						ConfiguredSchemaRelationRules<TFields>)
				| SchemaRulesCallback<
						SchemaRulesFor<
							TSource['schemaRules'],
							SchemaRulesTarget<
								ConfiguredSchemaResult<
									TSource,
									TClassName,
									TFields,
									TOptions,
									TUniqueIndexes
								>
							>,
							SchemaShapeOf<TOptions>
						> &
							ConfiguredSchemaRelationRules<TFields>,
						RequiredSchemaRuleName<TSource, SchemaShapeOf<TOptions>>
				  >,
	): ConfiguredSchemaResult<
		TSource,
		TClassName,
		TFields,
		TOptions,
		TUniqueIndexes
	>
	/**
	 * Rules the declaration's features require, each with the message
	 * `new App({ schemas })` reports while `.with` is missing (ADR-0339).
	 */
	readonly [requiredSchemaRules]?: {
		readonly [
			TRule in RequiredSchemaRuleName<TSource, SchemaShapeOf<TOptions>> & string
		]: `${TClassName} needs .with((plugins) => plugins.${TRule}({ … })): a feature set in its define() requires that rule`
	}
}

/**
 * The messages of the rules an unfinished declaration's features require
 * (`never` once `.with` is called): `new App({ schemas })` reports them
 * (ADR-0339). A generic schema reduces to no message.
 */
export type SchemaRequiredRuleMessages<TSchema> = TSchema extends {
	readonly [requiredSchemaRules]?: infer TRequired extends Readonly<
		Record<string, string>
	>
}
	? TRequired[keyof TRequired] extends infer TMessage extends string
		? // A generic schema's messages are `string`: no message.
			string extends TMessage
			? never
			: TMessage
		: never
	: never

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
	TUniqueIndexes extends UniqueIndexFields = never,
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
		TUsed | TName,
		TUniqueIndexes
	>
}

/** Value of `App.Schema.define(...)` and of each shape method: a usable schema plus its chain. */
export type DeclaredSchema<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaFields,
	TOptions extends object,
	TUsed extends PropertyKey = never,
	TUniqueIndexes extends UniqueIndexFields = never,
> = ConfiguredSchemaResult<
	TSource,
	TClassName,
	TFields,
	TOptions,
	TUniqueIndexes
> &
	SchemaShapeMethods<
		TSource,
		TClassName,
		TFields,
		TOptions,
		TUsed,
		TUniqueIndexes
	> &
	SchemaRulesMethod<TSource, TClassName, TFields, TOptions, TUniqueIndexes>

type DeclarationOptions = SchemaOptions<string, SchemaFields> &
	Readonly<Record<string, unknown>>

type DeclarationStatics = (
	schema: SchemaDefinition,
) => Readonly<Record<string, unknown>>

/** The features and rules of one configured factory, read when it is configured. */
export interface SchemaDeclarationExtensions {
	/** Features by name: `define` keys and, until removed, shape methods. */
	readonly features: ReadonlyMap<string, SchemaShapeMethodRuntime>
	/** Rule names of the installed plugins: the `.with` builder methods. */
	readonly rules: readonly string[]
}

/** One declaration in progress: its options and what `define` set. */
interface DeclarationState {
	readonly options: DeclarationOptions
	/** Shape methods still available on the chain. */
	readonly methods: ReadonlyMap<string, SchemaShapeMethodRuntime>
	/** `[feature, rule]` pairs the `define` features require. */
	readonly requiredRules: readonly (readonly [string, string])[]
	/** Whether `define` set feature keys (callback-only `.with`). */
	readonly definedFeatures: boolean
}

// Core's builder method beside the plugins' rules (ADR-0328, ADR-0339).
const coreRuleNames: readonly string[] = ['relations']

const readRules = (
	input: unknown,
	ruleNames: readonly string[],
	state: DeclarationState,
	className: string,
): Readonly<Record<string, unknown>> => {
	if (
		typeof input !== 'function' &&
		(typeof input !== 'object' || input === null)
	) {
		throw new TypeError('schema rules must be an object')
	}
	const rules =
		typeof input === 'function'
			? collectSchemaRules(
					(plugins) => Reflect.apply(input, undefined, [plugins]),
					[...coreRuleNames, ...ruleNames],
				)
			: (input as Readonly<Record<string, unknown>>)
	const missing = state.requiredRules.find(
		([, rule]) => !Object.hasOwn(rules, rule),
	)
	if (missing !== undefined) {
		const [feature, rule] = missing
		throw new TypeError(
			`${className} sets ${feature} in define(), which requires .with((plugins) => plugins.${rule}({ … }))`,
		)
	}
	return rules
}

const defineDeclaredSchema = (
	state: DeclarationState,
	ruleNames: readonly string[],
	statics?: DeclarationStatics,
): unknown => {
	const { options } = state
	const chain: [string, unknown][] = [
		[
			'with',
			markSchemaDeclarationMethod((input: unknown) => {
				const rules = readRules(input, ruleNames, state, options.className)
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
						featureIndexes: state.definedFeatures,
					},
					statics,
				)
			}),
		],
	]
	for (const [name, method] of state.methods) {
		const remaining = new Map(state.methods)
		remaining.delete(name)
		chain.push([
			name,
			markSchemaDeclarationMethod((...arguments_: readonly unknown[]) =>
				defineDeclaredSchema(
					{
						...state,
						options: { ...options, ...method.apply(...arguments_) },
						methods: remaining,
					},
					ruleNames,
					statics,
				),
			),
		])
	}
	return defineOrdinarySchemaModel(
		options,
		Object.fromEntries(chain),
		{
			featureIndexes: state.definedFeatures,
			missingRules: state.requiredRules,
		},
		statics,
	)
}

const isCoreDefineKey = (key: string): boolean =>
	key === 'className' || key === 'fields' || key === 'indexes'

/**
 * Applies the feature keys of one `define` call (`softDelete: { mode }`,
 * `acl: true`, ADR-0339): each one applies the feature of the same name,
 * whose shape method then leaves the chain. Other keys stay declaration
 * options, checked by the caller.
 */
const applyDefineFeatures = (
	options: Readonly<Record<string, unknown>>,
	features: ReadonlyMap<string, SchemaShapeMethodRuntime>,
): DeclarationState => {
	const declaration: [string, unknown][] = []
	const patches: object[] = []
	const methods = new Map(features)
	const requiredRules: (readonly [string, string])[] = []
	for (const [key, value] of Object.entries(options)) {
		const feature = isCoreDefineKey(key) ? undefined : features.get(key)
		if (feature === undefined) {
			declaration.push([key, value])
			continue
		}
		if (value !== true && (typeof value !== 'object' || value === null)) {
			throw new TypeError(
				`define() feature ${key} takes true or an options object`,
			)
		}
		patches.push(value === true ? feature.apply() : feature.apply(value))
		methods.delete(key)
		requiredRules.push(...feature.requires.map((rule) => [key, rule] as const))
	}
	return {
		// Option keys come from Core, the factory or a plugin feature.
		options: Object.assign(
			Object.fromEntries(declaration),
			...patches,
		) as DeclarationOptions,
		methods,
		requiredRules,
		definedFeatures: patches.length > 0,
	}
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
 * `statics` bound to every class it creates. The options may set feature
 * keys and `indexes` too (ADR-0339).
 */
export const defineFactorySchema = (
	extensions: SchemaDeclarationExtensions,
	options: object,
	statics: DeclarationStatics | undefined,
): unknown => {
	assertPlainObject(options, 'schema options must be an object')
	if (statics !== undefined && typeof statics !== 'function') {
		throw new TypeError('schema factory statics must be a function')
	}
	return defineDeclaredSchema(
		applyDefineFeatures(
			options as Readonly<Record<string, unknown>>,
			extensions.features,
		),
		extensions.rules,
		statics,
	)
}

/** @internal Creates the schema namespace of one configured factory. */
export const createConfiguredSchemaNamespace = (
	extensions: SchemaDeclarationExtensions,
): ConfiguredSchemaNamespace => {
	const namespace = Object.freeze({
		define: (options: DeclarationOptions) => {
			assertPlainObject(options, 'schema options must be an object')
			const state = applyDefineFeatures(options, extensions.features)
			assertDeclarationOptionKeys(
				Object.fromEntries(
					Object.keys(options)
						.filter((key) => !extensions.features.has(key))
						.map((key) => [key, true]),
				),
			)
			return defineDeclaredSchema(state, extensions.rules)
		},
		defineSpecialized: Schema.defineSpecialized.bind(Schema),
		is: Schema.is.bind(Schema),
	})
	configuredSchemaNamespaces.add(namespace)
	// The static type of the chain comes from the factory's plugins.
	return namespace as unknown as ConfiguredSchemaNamespace
}
