import type {
	ApplicationOperationTransportPlan,
	CompiledSchemaRegistry,
} from '@ultimabase/core'
import type { PluginIdentity } from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	readRestOperationBindingMetadata,
	resolveRestOperationInputSchema,
} from './binding-metadata.js'
import {
	createRestRouteFragment,
	createRestRoutePlugin,
	encodeRestPathSegment,
	restProtocol,
	type RestRouteFragmentValue,
} from './routes.js'

/** Compiles only the exact application operations selected by one REST instance. */
export const compileRestOperationRouteFragment = (options: {
	readonly basePath: string
	readonly plan: ApplicationOperationTransportPlan<typeof restProtocol>
	readonly schemas: CompiledSchemaRegistry
	readonly owner: PluginIdentity
	readonly pluginVersion: string
}): RestRouteFragmentValue => {
	const plugin = createRestRoutePlugin(options.owner, options.pluginVersion)
	return createRestRouteFragment(
		options.plan.operations.map((operation) => {
			const metadata = readRestOperationBindingMetadata(
				operation.metadata,
				operation.errors,
				operation.name,
			)
			resolveRestOperationInputSchema(
				metadata.inputSchema,
				operation,
				options.schemas,
			)
			const path = `${options.basePath}${metadata.path ?? `/operations/${encodeRestPathSegment(operation.name, 'REST operation name')}`}`
			const errors = immutableArray(operation.errors)
			return immutableRecord({
				errors,
				kind: 'rest-plugin-operation-route' as const,
				method: 'POST' as const,
				operation: operation.name,
				operationVersion: operation.version,
				path,
				protocol: restProtocol,
				provenance: immutableRecord({
					method: 'POST' as const,
					operation: immutableRecord({
						errors,
						name: operation.name,
						version: operation.version,
					}),
					path,
					plugin,
					protocolVersion: restProtocol.version,
				}),
			})
		}),
	)
}
