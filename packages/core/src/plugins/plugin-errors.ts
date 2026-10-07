import { FrameworkError } from '../errors/framework-error.js'
import { formatPluginIdentity, type PluginIdentity } from './manifest.js'

export type DuplicatePluginSource = 'definition' | 'graph'

/** Creates one stable duplicate diagnostic shared by both graph boundaries. */
export const createDuplicatePluginError = (
	identity: PluginIdentity,
	source: DuplicatePluginSource,
): FrameworkError<'PLUGIN_DUPLICATE'> =>
	new FrameworkError(
		'PLUGIN_DUPLICATE',
		`Plugin "${formatPluginIdentity(identity)}" was declared more than once.`,
		{
			internalDetails: {
				pluginId: identity.pluginId,
				...(identity.instanceId === undefined
					? {}
					: { instanceId: identity.instanceId }),
				source,
			},
		},
	)
