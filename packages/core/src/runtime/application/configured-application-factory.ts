import { immutableArray, immutableRecord } from '@ultimabase/shared'

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
import { readSchemaShapeMethods } from '../../plugins/schema-extensions.js'
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
 * (`App.RoleSchema`, ADR-0322); without any, exactly the factory.
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
	 * Returns a new factory with plugins appended to its flat ordered tuple.
	 *
	 * @example `const Api = DatabaseApplication.use(httpPlugin(), restPlugin())`
	 */
	use<const TAdded extends readonly PluginDefinition[]>(
		...plugins: TAdded
	): ConfiguredApplicationFactory<
		AppendPlugins<TPlugins, TAdded>,
		MergeInstalledPluginSources<TSource, TAdded>
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

/** @internal Creates one frozen descendant without compiling an application graph. */
export const appendConfiguredPlugins = <
	TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
	const TAdded extends readonly PluginDefinition[],
>(
	factory: object,
	...added: TAdded
): ConfiguredApplicationFactory<
	AppendPlugins<TPlugins, TAdded>,
	MergeInstalledPluginSources<TSource, TAdded>
> => {
	if (added.length === 0) {
		return factory as ConfiguredApplicationFactory<
			AppendPlugins<TPlugins, TAdded>,
			MergeInstalledPluginSources<TSource, TAdded>
		>
	}
	const parent = factory as unknown as RuntimeApplicationConstructor
	const plugins = immutableArray([...readConfiguredPlugins(factory), ...added])
	const ConfiguredApplication = class extends parent {}

	configuredPlugins.set(ConfiguredApplication, plugins)
	// A factory whose plugins add shape methods (`.softDelete()`) declares
	// schemas through its own namespace; others share their parent's.
	const shapes = readSchemaShapeMethods(plugins)
	if (shapes.size > 0) {
		Object.defineProperty(ConfiguredApplication, 'Schema', {
			configurable: false,
			enumerable: true,
			value: createConfiguredSchemaNamespace(shapes),
			writable: false,
		})
	}
	// Plugin schema factories declare through the same chain (ADR-0322).
	const context = immutableRecord({
		define: (options: object, statics?: FactoryStatics) =>
			defineFactorySchema(shapes, options, statics),
	})
	for (const [name, create] of readSchemaFactories(plugins)) {
		// Inherited factories are rebound to this factory's own shape methods.
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
		AppendPlugins<TPlugins, TAdded>,
		MergeInstalledPluginSources<TSource, TAdded>
	>
}
