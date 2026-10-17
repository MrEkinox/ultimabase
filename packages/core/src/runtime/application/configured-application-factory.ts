import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { PluginDefinition } from '../../plugins/definition.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { ConfiguredSchemaNamespace } from '../../schema/schema/definition.js'
import type { UltimaBase } from './ultima-base.js'
import type { UltimaBaseInstanceOptions } from './ultima-base-contracts.js'
import type {
	RegisterDeclarationCheck,
	SchemaRegistrationChecks,
} from './schema-registration-checks.js'
import type {
	EmptyPluginSourceState,
	MergePluginSourceState,
	PluginSourceState,
} from '../../plugins/source-projections.js'
import type { PluginSource } from '../../plugins/definition.js'
import { readSchemaFeatures } from '../../plugins/schema-extensions.js'
import { readSchemaRuleNames } from '../../plugins/schema-rule-names.js'
import {
	readSchemaFactories,
	type SchemaFactoriesFor,
} from '../../plugins/schema-factories.js'
import {
	createConfiguredSchemaNamespace,
	defineFactorySchema,
} from '../../schema/schema/schema-declaration-chain.js'

type FactoryStatics = (
	schema: SchemaDefinition,
) => Readonly<Record<string, unknown>>

type AppendPlugins<
	TPlugins extends readonly PluginDefinition[],
	TAdded extends readonly PluginDefinition[],
> = readonly [...TPlugins, ...TAdded]

/**
 * One `use()` argument: a plugin, or a preset's array of plugins and
 * nested arrays, installed in order (ADR-0340).
 */
export type PluginInput = PluginDefinition | readonly PluginInput[]

/** Flattens `use()` arguments into the ordered plugin tuple they install. */
export type FlattenPluginInputs<TInputs extends readonly PluginInput[]> =
	Extract<FlattenInputs<TInputs>, readonly PluginDefinition[]>

type FlattenInputs<TInputs extends readonly PluginInput[]> =
	TInputs extends readonly [
		infer TFirst,
		...infer TRest extends readonly PluginInput[],
	]
		? TFirst extends PluginDefinition
			? readonly [TFirst, ...FlattenInputs<TRest>]
			: TFirst extends readonly PluginInput[]
				? readonly [...FlattenInputs<TFirst>, ...FlattenInputs<TRest>]
				: never
		: number extends TInputs['length']
			? // An open list keeps its plugin type; open nested lists widen.
				TInputs[number] extends PluginDefinition
				? readonly TInputs[number][]
				: readonly PluginDefinition[]
			: readonly []

/** Folds exact tuple receipts while treating an open array as one broad source. */
export type MergeInstalledPluginSources<
	TSource extends PluginSourceState,
	TPlugins extends readonly PluginDefinition[],
> = TPlugins extends readonly [
	infer TFirst extends PluginDefinition,
	...infer TRest extends readonly PluginDefinition[],
]
	? MergeInstalledPluginSources<
			MergePluginSourceState<TSource, PluginSource<TFirst>>,
			TRest
		>
	: number extends TPlugins['length']
		? MergePluginSourceState<TSource, PluginSource<TPlugins[number]>>
		: TSource

/**
 * One configured factory plus the schema factories its plugins add
 * (ADR-0322); without any, exactly the factory.
 */
export type ConfiguredApplicationFactory<
	TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState = EmptyPluginSourceState,
> = TSource['schemaFactories'] extends readonly []
	? ConfiguredUltimaBaseFactory<TPlugins, TSource>
	: ConfiguredUltimaBaseFactory<TPlugins, TSource> &
			SchemaFactoriesFor<TSource['schemaFactories'], TSource>

/**
 * Constructs one application with the exact immutable plugin tuple accumulated
 * by `UltimaBase.use()`.
 */
export interface ConfiguredUltimaBaseFactory<
	TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState = EmptyPluginSourceState,
> {
	/** Uses the same schema namespace as the zero-plugin root factory. */
	readonly Schema: ConfiguredSchemaNamespace<TSource>
	/**
	 * Returns a new factory with plugins, and the plugins of preset arrays,
	 * appended in order to its flat tuple (ADR-0340).
	 *
	 * @example `new (App.use(hooksPlugin(postHooks)))({ schemas })`
	 */
	use<const TAdded extends readonly PluginInput[]>(
		...plugins: TAdded
	): ConfiguredApplicationFactory<
		AppendPlugins<TPlugins, FlattenPluginInputs<TAdded>>,
		MergeInstalledPluginSources<TSource, FlattenPluginInputs<TAdded>>
	>
	/**
	 * Creates one application without repeating its configured plugin tuple.
	 *
	 * @example `const application = new Api({ schemas: [Post] })`
	 */
	new <const TSchemas extends readonly SchemaDefinition[]>(
		options: UltimaBaseInstanceOptions<TSchemas, TPlugins> &
			SchemaRegistrationChecks<TSchemas> &
			RegisterDeclarationCheck<TSchemas>,
	): UltimaBase<TSchemas, TPlugins, TSource>
}

type RuntimeApplicationConstructor = new (options: unknown) => object

const configuredPlugins = new WeakMap<object, readonly PluginDefinition[]>()
const emptyPlugins: readonly PluginDefinition[] = immutableArray([])

/** @internal Reads the one frozen tuple installed on a configured factory. */
export const readConfiguredPlugins = (
	factory: object,
): readonly PluginDefinition[] => configuredPlugins.get(factory) ?? emptyPlugins

// Arrays are presets: their plugins install in order; anything else is
// left for plugin normalization to reject.
const flattenPluginInputs = (
	inputs: readonly PluginInput[],
): PluginDefinition[] =>
	inputs.flatMap((input) =>
		isUnknownArray(input) ? flattenPluginInputs(input) : [input],
	)

/** @internal Creates one frozen descendant without compiling an application graph. */
export const appendConfiguredPlugins = <
	TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
	const TAdded extends readonly PluginInput[],
>(
	factory: object,
	...inputs: TAdded
): ConfiguredApplicationFactory<
	AppendPlugins<TPlugins, FlattenPluginInputs<TAdded>>,
	MergeInstalledPluginSources<TSource, FlattenPluginInputs<TAdded>>
> => {
	const added = flattenPluginInputs(inputs)
	if (added.length === 0) {
		return factory as ConfiguredApplicationFactory<
			AppendPlugins<TPlugins, FlattenPluginInputs<TAdded>>,
			MergeInstalledPluginSources<TSource, FlattenPluginInputs<TAdded>>
		>
	}
	const parent = factory as unknown as RuntimeApplicationConstructor
	const plugins = immutableArray([...readConfiguredPlugins(factory), ...added])
	const ConfiguredApplication = class extends parent {}

	configuredPlugins.set(ConfiguredApplication, plugins)
	// A factory whose plugins add features (`softDelete`) or rules (`access`)
	// declares schemas through its own namespace; others share their parent's.
	const extensions = immutableRecord({
		features: readSchemaFeatures(plugins),
		rules: readSchemaRuleNames(plugins),
	})
	if (extensions.features.size > 0 || extensions.rules.length > 0) {
		Object.defineProperty(ConfiguredApplication, 'Schema', {
			configurable: false,
			enumerable: true,
			value: createConfiguredSchemaNamespace(extensions),
			writable: false,
		})
	}
	// Plugin schema factories declare through the same chain (ADR-0322).
	const context = immutableRecord({
		define: (options: object, statics?: FactoryStatics) =>
			defineFactorySchema(extensions, options, statics),
		features: new Set(extensions.features.keys()),
	})
	for (const [name, create] of readSchemaFactories(plugins)) {
		// Inherited factories are rebound to this factory's own features and rules.
		if (Object.hasOwn(ConfiguredApplication, name)) {
			throw new TypeError(`Reserved schema factory name: ${name}`)
		}
		const factory: unknown = create(context)
		if (typeof factory !== 'object' || factory === null) {
			throw new TypeError(`schema factory ${name} must return an object`)
		}
		Object.defineProperty(ConfiguredApplication, name, {
			configurable: false,
			enumerable: true,
			value: Object.freeze(factory),
			writable: false,
		})
	}
	return Object.freeze(
		ConfiguredApplication,
	) as unknown as ConfiguredApplicationFactory<
		AppendPlugins<TPlugins, FlattenPluginInputs<TAdded>>,
		MergeInstalledPluginSources<TSource, FlattenPluginInputs<TAdded>>
	>
}
