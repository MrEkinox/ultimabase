import type {
	ApplicationSchemaMutationTransportPlan,
	CompiledSchemaRegistry,
} from '@ultimabase/core'
import type { PluginIdentity } from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { readRestSchemaRoutes, type RestSchemaRoutesOption } from './options.js'
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
	isRestRouteEnabled,
	readRestVirtualFields,
} from './schema-routes.js'

const commandPath = (command: string): string => {
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

/** Compiles request-authority mutation bindings for exposed application schemas. */
export const compileRestSchemaMutationRouteFragment = (options: {
	readonly basePath: string
	readonly defaultRoutes: RestSchemaRoutesOption | undefined
	readonly owner: PluginIdentity
	readonly plan: ApplicationSchemaMutationTransportPlan<typeof restProtocol>
	readonly pluginVersion: string
	readonly schemas: CompiledSchemaRegistry
}): RestRouteFragmentValue => {
	const plugin = createRestRoutePlugin(options.owner, options.pluginVersion)
	const routes: RestRouteCandidate[] = []
	for (const descriptor of options.plan.mutations) {
		// Master-only mutations are never generated as public routes.
		if (descriptor.authority !== 'request') continue
		const schema = options.schemas.get(descriptor.schema)
		if (schema === undefined) {
			throw new TypeError(
				`REST schema mutation ${descriptor.command} targets an unavailable schema`,
			)
		}
		if (
			schema.provenance.schema.owner.kind !== 'application' ||
			!isRestRouteEnabled(
				readRestSchemaRoutes(schema),
				options.defaultRoutes,
				'mutations',
			)
		) {
			continue
		}
		assertRestSchemaResultCodecs(schema)
		const path = `${restClassPath(options.basePath, schema.className)}/{id}/${commandPath(descriptor.command)}`
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
				schema: schema.className,
				virtualFields: readRestVirtualFields(schema),
			}),
		)
	}
	return createRestRouteFragment(routes)
}
