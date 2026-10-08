import {
	plugin,
	requireCapability,
	type PluginInstance,
} from '@ultimabase/core'
import { graphqlHttpEndpointCapability } from '@ultimabase/graphql-http'
import {
	httpBrowserBootstrapRoute,
	provideHttpEndpoints,
} from '@ultimabase/http-plugin'

import {
	normalizeGraphiqlPluginOptions,
	type GraphiqlPluginOptions,
} from './options.js'
import { createGraphiqlPageResponse } from './page.js'

const endpointRequirement = requireCapability(
	graphqlHttpEndpointCapability,
	'^1.0.0',
)

const httpPeers = [
	{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
] as const
const graphiqlPluginMetadata = {
	core: '^0.0.0',
	id: '@ultimabase/graphiql-plugin',
	version: '0.0.0',
} as const

/** Names one independently configured GraphiQL UI plugin. */
export type GraphiqlPlugin =
	| PluginInstance<
			typeof graphiqlPluginMetadata & {
				readonly peers: typeof httpPeers
				readonly environment: readonly ['environment:network']
			}
	  >
	| PluginInstance<typeof graphiqlPluginMetadata>

/** Adds a development GraphiQL page for the selected GraphQL HTTP provider. */
export const graphiqlPlugin = (
	options: GraphiqlPluginOptions,
): GraphiqlPlugin => {
	const normalized = normalizeGraphiqlPluginOptions(options)
	if (!normalized.enabled) {
		return plugin({
			...graphiqlPluginMetadata,
			contributions: [],
		})
	}

	const routes = provideHttpEndpoints({
		contributionId: 'official-graphiql-browser-route',
		create: ({ capabilities }) => {
			const endpoint = capabilities.get(endpointRequirement)
			return httpBrowserBootstrapRoute({
				path: normalized.path,
				protocol: { name: 'ultimabase.graphiql', version: '1.0.0' },
				handle: () => createGraphiqlPageResponse(endpoint.path),
			})
		},
	})
	return plugin({
		...graphiqlPluginMetadata,
		contributions: [routes, endpointRequirement],
		environment: ['environment:network'],
		peers: httpPeers,
	})
}
