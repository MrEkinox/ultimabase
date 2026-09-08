import {
	provideCapability,
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
} from '@ultimabase/core'
import { graphqlApplicationCapability } from '@ultimabase/graphql-plugin'
import { httpEndpointContributionsCapability } from '@ultimabase/http-plugin'
import {
	definePluginModule,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { createGraphqlYogaMountResource } from './handler.js'
import {
	normalizeGraphqlYogaPluginOptions,
	type GraphqlYogaPluginOptions,
} from './options.js'

const graphqlYogaPluginModule: PluginModule<
	'@ultimabase/graphql-yoga-plugin',
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/graphql-yoga-plugin',
	version: '0.0.0',
})

const graphqlApplicationRequirement: CapabilityRequirement<
	typeof graphqlApplicationCapability,
	false,
	'^1.0.0',
	'materialization'
> = requireCapability(graphqlApplicationCapability, '^1.0.0')

const graphqlYogaPeers = [
	{ pluginId: '@ultimabase/graphql-plugin', version: '^0.0.0' },
	{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
] as const

const graphqlYogaPrivileges = [
	{
		name: 'transport:expose',
		reason: 'Mounts the selected application GraphQL schema over HTTP.',
	},
] as const

type GraphqlYogaPluginDefinition = Readonly<{
	readonly capabilities: Readonly<{
		readonly provides: readonly [
			CapabilityProviderDeclaration<typeof httpEndpointContributionsCapability>,
		]
		readonly requires: readonly [typeof graphqlApplicationRequirement]
	}>
	readonly peers: typeof graphqlYogaPeers
	readonly privileges: typeof graphqlYogaPrivileges
	readonly setup: () => GraphqlYogaPluginExports
}>

/** Exposes only the normalized public adapter configuration. */
export interface GraphqlYogaPluginExports {
	readonly bodyLimit: number
	readonly introspection: boolean
	readonly path: string
}

/** Names the single official GraphQL-over-HTTP adapter. */
export type GraphqlYogaPlugin = PluginModuleInstance<
	typeof graphqlYogaPluginModule,
	GraphqlYogaPluginDefinition
>

/** Mounts one explicit GraphQL sibling through the shared HTTP application. */
export const graphqlYogaPlugin = (
	options: GraphqlYogaPluginOptions = {},
): GraphqlYogaPlugin => {
	const normalized = normalizeGraphqlYogaPluginOptions(options)
	const endpointProvider = provideCapability(
		httpEndpointContributionsCapability,
		{
			contributionId: 'official-graphql-yoga-http-mount',
			create: ({ capabilities }) => {
				const resource = createGraphqlYogaMountResource(
					capabilities.get(graphqlApplicationRequirement),
					normalized,
				)
				return {
					dispose: resource.dispose,
					value: immutableArray([resource.mount]),
				}
			},
		},
	)
	return graphqlYogaPluginModule.plugin({
		capabilities: {
			provides: [endpointProvider],
			requires: [graphqlApplicationRequirement],
		},
		peers: graphqlYogaPeers,
		privileges: graphqlYogaPrivileges,
		setup: () => immutableRecord(normalized),
	})
}
