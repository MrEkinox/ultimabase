import { immutableArray } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'

export type DuplicatePluginSource = 'definition' | 'graph'

/** Creates one stable duplicate diagnostic shared by both graph boundaries. */
export const createDuplicatePluginError = (
	pluginName: string,
	source: DuplicatePluginSource,
): FrameworkError<'PLUGIN_DUPLICATE'> =>
	new FrameworkError(
		'PLUGIN_DUPLICATE',
		`Plugin "${pluginName}" was declared more than once.`,
		{
			internalDetails: {
				pluginName,
				source,
			},
		},
	)

/** Creates the same exclusive-role diagnostic during normalization and resolution. */
export const createExclusiveSlotConflictError = (
	slot: string,
	firstPluginName: string,
	secondPluginName: string,
): FrameworkError<'PLUGIN_CONFLICT'> =>
	new FrameworkError(
		'PLUGIN_CONFLICT',
		`Plugins "${firstPluginName}" and "${secondPluginName}" both occupy exclusive slot "${slot}".`,
		{
			internalDetails: {
				kind: 'exclusive-slot',
				slot,
				pluginNames: immutableArray([firstPluginName, secondPluginName]),
			},
		},
	)
