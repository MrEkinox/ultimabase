import {
	isPluginOperationDefinition,
	type ApplicationOperationTransportPlan,
	type CompiledSchemaRegistry,
	type PluginIdentity,
	type PluginOperationDefinition,
} from '@ultimabase/core'
import { immutableArray, isUnknownArray } from '@ultimabase/shared'

import {
	readRestOperationBindingMetadata,
	resolveRestOperationInputSchema,
} from './binding-metadata.js'
import {
	createRestRouteFragment,
	encodeRestPathSegment,
	restProtocol,
	type RestRouteFragmentValue,
} from './routes.js'

/** @internal Validates the exact operation tokens exposed by one REST instance. */
export const normalizeRestOperations = (
	value: unknown,
): readonly PluginOperationDefinition[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError('REST plugin operations must be an array')
	}
	const names = new Set<string>()
	const operations: PluginOperationDefinition[] = []
	for (const [index, operation] of value.entries()) {
		if (!isPluginOperationDefinition(operation)) {
			throw new TypeError(
				`REST plugin operations[${String(index)}] must be an operation token`,
			)
		}
		if (names.has(operation.name)) {
			throw new TypeError(`REST plugin operations repeats ${operation.name}`)
		}
		names.add(operation.name)
		operations.push(operation)
	}
	return immutableArray(operations)
}

/** Compiles only the exact application operations selected by one REST instance. */
export const compileRestOperationRouteFragment = (options: {
	readonly basePath: string
	readonly plan: ApplicationOperationTransportPlan<typeof restProtocol>
	readonly schemas: CompiledSchemaRegistry
	readonly owner: PluginIdentity
	readonly pluginVersion: string
}): RestRouteFragmentValue =>
	createRestRouteFragment(
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
			return {
				errors: operation.errors,
				kind: 'rest-plugin-operation-route' as const,
				method: 'POST' as const,
				operation: operation.name,
				operationVersion: operation.version,
				path: `${options.basePath}${metadata.path ?? `/operations/${encodeRestPathSegment(operation.name, 'REST operation name')}`}`,
				plugin: {
					...options.owner,
					version: options.pluginVersion,
				},
				protocol: restProtocol,
			}
		}),
	)
