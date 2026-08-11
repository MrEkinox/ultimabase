import type { PluginDefinition, PluginExports } from '../plugins/definition.js'
import type { PluginIdentity } from '../plugins/manifest.js'

/** Recursively retains top-level and composition-nested plugin definitions. */
export type ConfiguredPlugin<TPlugins extends readonly PluginDefinition[]> =
	readonly PluginDefinition[] extends TPlugins
		? PluginDefinition
		: TPlugins[number] extends infer TPlugin
			? TPlugin extends PluginDefinition
				? | TPlugin
					| ConfiguredPlugin<
							Extract<TPlugin['plugins'], readonly PluginDefinition[]>
					  >
				: never
			: never

/** Lists the literal stable IDs addressable through one application configuration. */
export type ConfiguredPluginId<TPlugins extends readonly PluginDefinition[]> =
	ConfiguredPlugin<TPlugins>['manifest']['identity']['pluginId']

/** Lists the structured identities addressable through one application configuration. */
export type ConfiguredPluginIdentity<
	TPlugins extends readonly PluginDefinition[],
> = ConfiguredPlugin<TPlugins>['manifest']['identity']

type ConfiguredPluginById<
	TPlugins extends readonly PluginDefinition[],
	TPluginId extends ConfiguredPluginId<TPlugins>,
> =
	ConfiguredPlugin<TPlugins> extends infer TPlugin
		? TPlugin extends PluginDefinition
			? TPlugin['manifest']['identity']['pluginId'] extends TPluginId
				? TPlugin
				: never
			: never
		: never

/** Resolves setup exports for one configured literal plugin ID. */
export type ConfiguredPluginExports<
	TPlugins extends readonly PluginDefinition[],
	TPluginId extends ConfiguredPluginId<TPlugins>,
> =
	string extends ConfiguredPluginId<TPlugins>
		? unknown
		: PluginExports<ConfiguredPluginById<TPlugins, TPluginId>>

type ConfiguredPluginByIdentity<
	TPlugins extends readonly PluginDefinition[],
	TIdentity extends ConfiguredPluginIdentity<TPlugins>,
> =
	ConfiguredPlugin<TPlugins> extends infer TPlugin
		? TPlugin extends PluginDefinition
			? TIdentity extends TPlugin['manifest']['identity']
				? TPlugin
				: never
			: never
		: never

/** Resolves setup exports for one exact configured plugin identity. */
export type ConfiguredPluginIdentityExports<
	TPlugins extends readonly PluginDefinition[],
	TIdentity extends ConfiguredPluginIdentity<TPlugins>,
> =
	PluginIdentity extends ConfiguredPluginIdentity<TPlugins>
		? unknown
		: PluginExports<ConfiguredPluginByIdentity<TPlugins, TIdentity>>
