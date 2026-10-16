import type {
	SchemaFeatureRuntime,
	SchemaRulesFor,
	SchemaShapeOf,
} from '../../plugins/schema-extensions.js'
import type { PluginSourceState } from '../../plugins/source-projections.js'
import type {
	ConfiguredSchemaNamespace,
	ConfiguredSchemaResult,
} from './configured-schema-namespace.js'
import { assertPlainObject } from '../../exact-object-validation.js'
import {
	defineOrdinarySchemaModel,
	Schema,
	type SchemaDefinition,
	type SchemaFields,
	type SchemaOptions,
} from './definition.js'
import { markSchemaDeclarationMethod } from './declaration-methods.js'
import { assertDeclarationOptionKeys } from './definition-compilation.js'
import type { SchemaRulesTarget } from './registered-schemas.js'
import type { ConfiguredSchemaRelationRules } from './relation-rules.js'
import type { UniqueIndexFields } from './source-unique-targets.js'
import type { RequiredSchemaRuleName } from './define-features.js'
import {
	collectSchemaRules,
	readSchemaRulesObject,
	type SchemaRulesCallback,
	type SchemaRulesObject,
} from './schema-rules-builder.js'

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
	 * callbacks, so schemas may filter each other in both directions.
	 *
	 * @example `.with((plugins) => plugins.access({ read: ({ where }) => where.eq('archived', false) }))`
	 */
	with(
		rules:
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
			  >
			| SchemaRulesObject<
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

/** Value of `App.Schema.define(...)`: a usable schema plus its final `.with`. */
export type DeclaredSchema<
	TSource extends PluginSourceState,
	TClassName extends string,
	TFields extends SchemaFields,
	TOptions extends object,
	TUniqueIndexes extends UniqueIndexFields = never,
> = ConfiguredSchemaResult<
	TSource,
	TClassName,
	TFields,
	TOptions,
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
	/** Features by name: the keys installed plugins add to `define`. */
	readonly features: ReadonlyMap<string, SchemaFeatureRuntime>
	/** Rule names of the installed plugins: the `.with` builder methods. */
	readonly rules: readonly string[]
}

/** One declaration in progress: its options and what `define` set. */
interface DeclarationState {
	readonly options: DeclarationOptions
	/** `[feature, rule]` pairs the `define` features require. */
	readonly requiredRules: readonly (readonly [string, string])[]
	/** Whether `define` set feature keys, so its indexes may name their fields. */
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
	const names = [...coreRuleNames, ...ruleNames]
	let rules: Readonly<Record<string, unknown>>
	if (typeof input === 'function') {
		rules = collectSchemaRules(
			(plugins) => Reflect.apply(input, undefined, [plugins]),
			names,
			className,
		)
	} else {
		assertPlainObject(
			input,
			`${className}.with() takes an object of rules: .with({ access: { … } })`,
		)
		rules = readSchemaRulesObject(input, names, className)
	}
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
	const configure = markSchemaDeclarationMethod((input: unknown) => {
		// Relation filters join their relation field (ADR-0328).
		const { relations, ...rest }: Readonly<Record<string, unknown>> = {
			...readRules(input, ruleNames, state, options.className),
		}
		return defineOrdinarySchemaModel(
			{ ...options, ...rest },
			{},
			{ relations, featureIndexes: state.definedFeatures },
			statics,
		)
	})
	return defineOrdinarySchemaModel(
		options,
		{ with: configure },
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
 * `acl: true`, ADR-0339): each one adds the options of the feature of the
 * same name. Other keys stay declaration options, checked by the caller.
 */
const applyDefineFeatures = (
	options: Readonly<Record<string, unknown>>,
	features: ReadonlyMap<string, SchemaFeatureRuntime>,
): DeclarationState => {
	const declaration: [string, unknown][] = []
	const patches: [string, unknown][] = []
	const requiredRules: (readonly [string, string])[] = []
	let definedFeatures = false
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
		patches.push(
			...Object.entries(
				value === true ? feature.apply() : feature.apply(value),
			),
		)
		requiredRules.push(...feature.requires.map((rule) => [key, rule] as const))
		definedFeatures = true
	}
	return {
		// Keys are copied as entries, `__proto__` included (user-controlled).
		options: Object.fromEntries([
			...declaration,
			...patches,
		]) as DeclarationOptions,
		requiredRules,
		definedFeatures,
	}
}

const configuredSchemaNamespaces = new WeakSet<object>()

/**
 * Checks that one value is a Schema namespace of an UltimaBase factory: the
 * root one, or the one of a factory whose plugins add features.
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
		applyDefineFeatures(options, extensions.features),
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
			// Every other key, symbols included, is checked as before.
			assertDeclarationOptionKeys(
				Object.fromEntries(
					Reflect.ownKeys(options)
						.filter(
							(key) => typeof key !== 'string' || !extensions.features.has(key),
						)
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
