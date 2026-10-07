import {
	plugin,
	provideCapability,
	requireCapability,
	type PluginInstance,
} from '@ultimabase/core'
import { graphqlApplicationCapability } from '@ultimabase/graphql-plugin'
import { graphqlHttpEndpointCapability } from '@ultimabase/graphql-http'
import { httpEndpointContributionsCapability } from '@ultimabase/http-plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { createGraphqlYogaMountResource } from './handler.js'
import {
	normalizeGraphqlYogaPluginOptions,
	type GraphqlYogaPluginOptions,
} from './options.js'

const graphqlApplicationRequirement = requireCapability(
	graphqlApplicationCapability,
	'^1.0.0',
)

const graphqlYogaPeers = [
	{ pluginId: '@ultimabase/graphql-plugin', version: '^0.0.0' },
	{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
] as const

/** Names the single official GraphQL-over-HTTP adapter. */
export type GraphqlYogaPlugin = PluginInstance<{
	readonly id: '@ultimabase/graphql-yoga-plugin'
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly peers: typeof graphqlYogaPeers
}>

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
	const endpointDescriptionProvider = provideCapability(
		graphqlHttpEndpointCapability,
		{
			contributionId: 'official-graphql-yoga-http-endpoint',
			create: () => ({
				value: immutableRecord({ path: normalized.path }),
			}),
		},
	)
	return plugin({
		id: '@ultimabase/graphql-yoga-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			endpointProvider,
			endpointDescriptionProvider,
			graphqlApplicationRequirement,
		],
		peers: graphqlYogaPeers,
		permissions: {
			'transport:expose':
				'Mounts the selected application GraphQL schema over HTTP.',
		},
	})
}
