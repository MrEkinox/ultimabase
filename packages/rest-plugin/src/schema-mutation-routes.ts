import type {
	ApplicationSchemaMutationTransportPlan,
	CompiledSchemaRegistry,
	ExposedNativeSchemaMethod,
	ExposedPluginSchemaMethod,
	ExposedSchemaMutationTransportBinding,
} from '@ultimabase/core'
import type { PluginIdentity } from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	createRestRouteFragment,
	createRestRoutePlugin,
	encodeRestPathSegment,
	restClassPath,
	restProtocol,
	type RestRouteCandidate,
	type RestRouteFragmentValue,
} from './routes.js'
import {
	assertRestSchemaResultCodecs,
	readRestVirtualFields,
} from './schema-routes.js'

/** @internal The kebab-case path segment of one command (`soft-delete-one`). */
export const restCommandPath = (command: string): string => {
	const path = command
		.replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
		.replaceAll('_', '-')
		.toLowerCase()
	if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(path)) {
		throw new TypeError(
			`REST schema mutation command ${command} has no canonical path segment`,
		)
	}
	return encodeRestPathSegment(path, `REST schema mutation ${command}`)
}

/**
 * The part of an exposure plan the command routes read: which plugin
 * commands each schema serves, and their REST binding.
 */
interface RestCommandExposure {
	readonly schemas: readonly Readonly<{
		className: string
		methods: readonly (
			| Pick<ExposedNativeSchemaMethod, 'kind'>
			| Pick<ExposedPluginSchemaMethod, 'binding' | 'kind'>
		)[]
	}>[]
}

/**
 * Compiles the plugin commands the exposure plan serves on application
 * schemas (ADR-0324, ADR-0347): request authority, one row named by `id`.
 */
export const compileRestSchemaMutationRouteFragment = (options: {
	readonly basePath: string
	readonly owner: PluginIdentity
	readonly plan: RestCommandExposure
	readonly pluginVersion: string
	readonly schemas: CompiledSchemaRegistry
}): RestRouteFragmentValue => {
	const plugin = createRestRoutePlugin(options.owner, options.pluginVersion)
	const routes: RestRouteCandidate[] = []
	for (const { className, methods } of options.plan.schemas) {
		const schema = options.schemas.get(className)
		if (schema === undefined) continue
		for (const method of methods) {
			if (method.kind !== 'plugin') continue
			const descriptor = method.binding
			assertRestSchemaResultCodecs(schema)
			const path = `${restClassPath(options.basePath, className)}/{id}/${restCommandPath(descriptor.command)}`
			routes.push(
				immutableRecord({
					command: descriptor.command,
					errors: immutableArray(descriptor.errors),
					kind: 'rest-schema-mutation-route' as const,
					method: 'POST' as const,
					mutation: descriptor.mutation,
					mutationVersion: descriptor.version,
					operation: 'schemaMutation' as const,
					path,
					protocol: restProtocol,
					provenance: immutableRecord({
						method: 'POST' as const,
						mutation: immutableRecord({
							command: descriptor.command,
							name: descriptor.mutation,
							owner: immutableRecord({
								...(descriptor.owner.instanceId === undefined
									? {}
									: { instanceId: descriptor.owner.instanceId }),
								pluginId: descriptor.owner.pluginId,
								version: descriptor.owner.version,
							}),
							version: descriptor.version,
						}),
						path,
						plugin,
						protocolVersion: restProtocol.version,
						schema: schema.provenance.schema,
					}),
					schema: className,
					virtualFields: readRestVirtualFields(schema),
				}),
			)
		}
	}
	return createRestRouteFragment(routes)
}

/**
 * Groups by schema the request commands REST knows, served or not, so that a
 * closed command answers 405 rather than 404.
 */
export const readExposableCommands = (
	plan: ApplicationSchemaMutationTransportPlan<typeof restProtocol>,
): ReadonlyMap<string, readonly ExposedSchemaMutationTransportBinding[]> => {
	const bySchema = new Map<string, ExposedSchemaMutationTransportBinding[]>()
	for (const descriptor of plan.mutations) {
		// Master-only mutations are never generated as public routes.
		if (descriptor.authority !== 'request') continue
		const list = bySchema.get(descriptor.schema) ?? []
		list.push(descriptor)
		bySchema.set(descriptor.schema, list)
	}
	return bySchema
}
