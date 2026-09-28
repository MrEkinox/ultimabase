import {
	UltimaBase,
	type PluginDefinition,
	type SchemaDefinition,
	type UltimaBaseOptions,
} from '@ultimabase/core'

/** Initializes one setup-only UltimaBase fixture without reviving a Core factory. */
export const initializeRestTestApplication = async <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	options: UltimaBaseOptions<TSchemas, TPlugins>,
): Promise<UltimaBase<TSchemas, TPlugins>> =>
	new UltimaBase(options).initialize()
