import type {
	ApplicationOperationTransportPlan,
	CompiledSchemaRegistry,
} from '@ultimabase/core'
import type {
	PluginIdentity,
	PluginOperationDefinition,
} from '@ultimabase/core/plugin'
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
 * Compiles every public operation (ADR-0324) except the hidden ones: the
 * owner's REST path, or `/operations/<public name>`.
 */
export const compileRestOperationRouteFragment = (options: {
	readonly basePath: string
	readonly hide: readonly PluginOperationDefinition[]
	readonly plan: ApplicationOperationTransportPlan<typeof restProtocol>
	readonly schemas: CompiledSchemaRegistry
	readonly owner: PluginIdentity
	readonly pluginVersion: string
}): RestRouteFragmentValue => {
	const plugin = createRestRoutePlugin(options.owner, options.pluginVersion)
	const planned = new Set(options.plan.operations.map(({ name }) => name))
	for (const hidden of options.hide) {
		if (!planned.has(hidden.name)) {
			throw new TypeError(
				`restPlugin({ hide }) lists ${hidden.name}, which is not a public operation of this application`,
			)
		}
	}
	const hidden = new Set(options.hide.map(({ name }) => name))
	return createRestRouteFragment(
		options.plan.operations
			.filter(({ name }) => !hidden.has(name))
			.map((operation) => {
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
