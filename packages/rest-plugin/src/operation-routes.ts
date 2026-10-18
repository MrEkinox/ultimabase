import type {
	ApplicationOperationTransportPlan,
	CompiledSchemaRegistry,
} from '@ultimabase/core'
import type { PluginIdentity } from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	readRestOperationRouteMetadata,
	resolveRestOperationInputSchema,
} from './binding-metadata.js'
import {
	createRestRouteFragment,
	createRestRoutePlugin,
	encodeRestPathSegment,
	restProtocol,
	restRoutePath,
	type RestRouteFragmentValue,
} from './routes.js'

/**
 * Compiles every public operation the exposure plan serves (ADR-0324,
 * ADR-0341, ADR-0347): the owner's REST path, or `/operations/<public name>`.
 */
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
			const metadata = readRestOperationRouteMetadata(operation)
			resolveRestOperationInputSchema(
				metadata.inputSchema,
				operation,
				options.schemas,
			)
			const publicName = operation.public?.name ?? operation.name
			const path = restRoutePath(
				options.basePath,
				metadata.path ??
					`/operations/${encodeRestPathSegment(publicName, 'REST operation name')}`,
			)
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
