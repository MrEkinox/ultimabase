import type {
	PluginIdentity,
	PluginOperationDefinition,
} from '@ultimabase/core'

import {
	createRestRouteFragment,
	encodeRestPathSegment,
	restProtocol,
	type RestRouteFragmentValue,
} from './routes.js'

/** Compiles only the exact application operations selected by one REST instance. */
export const compileRestOperationRouteFragment = (options: {
	readonly basePath: string
	readonly operations: readonly PluginOperationDefinition[]
	readonly owner: PluginIdentity
	readonly pluginVersion: string
}): RestRouteFragmentValue =>
	createRestRouteFragment(
		options.operations.map((operation) => ({
			errors: operation.errors,
			kind: 'rest-plugin-operation-route' as const,
			method: 'POST' as const,
			operation: operation.name,
			operationVersion: operation.version,
			path: `${options.basePath}/operations/${encodeRestPathSegment(operation.name, 'REST operation name')}`,
			plugin: {
				...options.owner,
				version: options.pluginVersion,
			},
			protocol: restProtocol,
		})),
	)
