import type {
	ApplicationSchemaMutationTransportPlan,
	CompiledSchemaRegistry,
	PluginIdentity,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import { readRestSchemaRoutes, type RestSchemaRoutesOption } from './options.js'
import {
	createRestRouteFragment,
	encodeRestPathSegment,
	restProtocol,
	type RestRouteFragmentValue,
	type RestSchemaMutationRouteCandidate,
} from './routes.js'
import {
	areRestSchemaMutationsEnabled,
	assertRestSchemaResultCodecs,
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
	const plugin = immutableRecord({
		...options.owner,
		version: options.pluginVersion,
	})
	const routes: RestSchemaMutationRouteCandidate[] = []

	for (const descriptor of options.plan.mutations) {
		if (descriptor.authority !== 'request') continue
		const schema = options.schemas.get(descriptor.schema)
		if (schema === undefined) {
			throw new TypeError(
				`REST schema mutation ${descriptor.command} targets an unavailable schema`,
			)
		}
		const configuredRoutes = readRestSchemaRoutes(schema)
		if (
			schema.provenance.schema.owner.kind !== 'application' ||
			!areRestSchemaMutationsEnabled(configuredRoutes, options.defaultRoutes)
		) {
			continue
		}
		assertRestSchemaResultCodecs(schema)
		const classPath = `${options.basePath}/classes/${encodeRestPathSegment(schema.className, `REST schema className ${schema.className}`)}`
		routes.push(
			immutableRecord({
				command: descriptor.command,
				errors: descriptor.errors,
				kind: 'rest-schema-mutation-route' as const,
				method: 'POST' as const,
				mutation: descriptor.mutation,
				mutationOwner: descriptor.owner,
				mutationVersion: descriptor.version,
				operation: 'schemaMutation' as const,
				path: `${classPath}/{id}/${commandPath(descriptor.command)}`,
				plugin,
				protocol: restProtocol,
				schema: schema.className,
				schemaProvenance: schema.provenance.schema,
				virtualFields: readRestVirtualFields(schema),
			}),
		)
	}

	return createRestRouteFragment(routes)
}
