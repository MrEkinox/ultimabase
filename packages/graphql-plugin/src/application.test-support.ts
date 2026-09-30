import {
	UltimaBase,
	type PluginDefinition,
	type PluginSourceState,
	type SchemaDefinition,
	type UltimaBaseInstanceOptions,
} from '@ultimabase/core'

/** Initializes one setup-only UltimaBase fixture without reviving a Core factory. */
export const initializeGraphqlTestApplication = async <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	options: UltimaBaseInstanceOptions<TSchemas, readonly [...TPlugins]> & {
		readonly plugins: TPlugins
	},
): Promise<UltimaBase<TSchemas, readonly [...TPlugins], PluginSourceState>> => {
	const { plugins, ...instanceOptions } = options
	const Application = UltimaBase.use(...plugins)
	return new Application(instanceOptions).initialize()
}
