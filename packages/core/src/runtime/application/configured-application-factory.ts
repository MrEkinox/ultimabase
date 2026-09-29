import { immutableArray } from '@ultimabase/shared'

import type { PluginDefinition } from '../../plugins/definition.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { Schema } from '../../schema/schema/definition.js'
import type { UltimaBase, UltimaBaseInstanceOptions } from './ultima-base.js'

type AppendPlugin<
	TPlugins extends readonly PluginDefinition[],
	TPlugin extends PluginDefinition,
> = readonly [...TPlugins, TPlugin]

/**
 * Constructs one application with the exact immutable plugin tuple accumulated
 * by `UltimaBase.use()`.
 */
export interface ConfiguredUltimaBaseFactory<
	TPlugins extends readonly PluginDefinition[],
> {
	/** Uses the same schema namespace as the zero-plugin root factory. */
	readonly Schema: typeof Schema
	/**
	 * Returns a new factory with one plugin appended to its flat ordered tuple.
	 *
	 * @example `const Api = DatabaseApplication.use(httpPlugin())`
	 */
	use<const TPlugin extends PluginDefinition>(
		plugin: TPlugin,
	): ConfiguredUltimaBaseFactory<AppendPlugin<TPlugins, TPlugin>>
	/**
	 * Creates one application without repeating its configured plugin tuple.
	 *
	 * @example `const application = new Api({ schemas: [Post] })`
	 */
	new <const TSchemas extends readonly SchemaDefinition[]>(
		options: UltimaBaseInstanceOptions<TSchemas, TPlugins>,
	): UltimaBase<TSchemas, TPlugins>
}

type RuntimeApplicationConstructor = new (options: unknown) => object

const configuredPlugins = new WeakMap<object, readonly PluginDefinition[]>()
const emptyPlugins: readonly PluginDefinition[] = immutableArray([])

const readConfiguredPlugins = (factory: object): readonly PluginDefinition[] =>
	configuredPlugins.get(factory) ?? emptyPlugins

/** @internal Creates a frozen descendant without compiling an application graph. */
export const appendConfiguredPlugin = <
	TPlugins extends readonly PluginDefinition[],
	const TPlugin extends PluginDefinition,
>(
	factory: object,
	plugin: TPlugin,
): ConfiguredUltimaBaseFactory<AppendPlugin<TPlugins, TPlugin>> => {
	const parent = factory as unknown as RuntimeApplicationConstructor
	const plugins = immutableArray([...readConfiguredPlugins(factory), plugin])
	const ConfiguredApplication = class extends parent {}

	configuredPlugins.set(ConfiguredApplication, plugins)
	return Object.freeze(
		ConfiguredApplication,
	) as unknown as ConfiguredUltimaBaseFactory<AppendPlugin<TPlugins, TPlugin>>
}

/** @internal Resolves both migration forms into the one constructor plugin tuple. */
export const resolveConfiguredPlugins = (
	factory: object,
	constructorPlugins: readonly PluginDefinition[] | undefined,
): readonly PluginDefinition[] => {
	const plugins = configuredPlugins.get(factory)
	if (plugins === undefined) {
		return immutableArray(constructorPlugins ?? [])
	}
	if (constructorPlugins !== undefined) {
		throw new TypeError(
			'Configured UltimaBase factories install plugins through use(), not constructor options',
		)
	}
	return plugins
}
