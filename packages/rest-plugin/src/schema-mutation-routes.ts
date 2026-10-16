import type {
	ApplicationSchemaMutationTransportPlan,
	CompiledSchemaRegistry,
	ExposedSchemaMutationTransportBinding,
	SchemaDefinition,
} from '@ultimabase/core'
import type { PluginIdentity } from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	readRestSchemaRule,
	restMethodNames,
	type NormalizedRestRule,
} from './rules.js'
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
	isRestMethodEnabled,
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

const nativeKeys: ReadonlySet<string> = new Set(restMethodNames)

/**
 * Checks that every key of a schema rule names a native method or one of the
 * commands REST can expose on that schema (request authority, one row).
 */
const assertRuleKeys = (
	schema: SchemaDefinition,
	rule: NormalizedRestRule | undefined,
	commands: ReadonlySet<string>,
): void => {
	if (typeof rule !== 'object') return
	for (const key of Object.keys(rule)) {
		if (nativeKeys.has(key) || commands.has(key)) continue
		throw new TypeError(
			`rest.${key} on ${schema.className} names no schema method or exposable command${commands.size === 0 ? '' : `; its commands are ${[...commands].sort().join(', ')}`}`,
		)
	}
}

/**
 * Compiles the plugin commands an application schema's `plugins.rest(…)`
 * rule names (ADR-0324): request authority, one row named by `id`.
 */
export const compileRestSchemaMutationRouteFragment = (options: {
	readonly basePath: string
	readonly defaultRule: NormalizedRestRule | undefined
	readonly owner: PluginIdentity
	readonly plan: ApplicationSchemaMutationTransportPlan<typeof restProtocol>
	readonly pluginVersion: string
	readonly schemas: CompiledSchemaRegistry
}): RestRouteFragmentValue => {
	const plugin = createRestRoutePlugin(options.owner, options.pluginVersion)
	const exposable = readExposableCommands(options.plan)
	for (const schema of options.schemas.values()) {
		if (schema.provenance.schema.owner.kind !== 'application') continue
		assertRuleKeys(
			schema,
			readRestSchemaRule(schema),
			new Set(exposable.get(schema.className)?.map(({ command }) => command)),
		)
	}
	const routes: RestRouteCandidate[] = []
	for (const descriptors of exposable.values()) {
		for (const descriptor of descriptors) {
			const schema = options.schemas.get(descriptor.schema)
			if (schema === undefined) {
				throw new TypeError(
					`REST schema mutation ${descriptor.command} targets an unavailable schema`,
				)
			}
			if (
				schema.provenance.schema.owner.kind !== 'application' ||
				!isRestMethodEnabled(
					readRestSchemaRule(schema),
					options.defaultRule,
					descriptor.command,
				)
			) {
				continue
			}
			assertRestSchemaResultCodecs(schema)
			const path = `${restClassPath(options.basePath, schema.className)}/{id}/${restCommandPath(descriptor.command)}`
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
	}
	return createRestRouteFragment(routes)
}

/** Groups by schema the commands REST can expose: request authority, one row. */
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
