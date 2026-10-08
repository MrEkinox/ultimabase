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
	normalizeApolloSandboxPluginOptions,
	type ApolloSandboxPluginOptions,
} from './options.js'
import { createApolloSandboxPageResponse } from './page.js'

const endpointRequirement = requireCapability(
	graphqlHttpEndpointCapability,
	'^1.0.0',
)

const httpPeers = [
	{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
] as const
const apolloSandboxPluginMetadata = {
	core: '^0.0.0',
	id: '@ultimabase/apollo-sandbox-plugin',
	version: '0.0.0',
} as const

/** Names one independently configured Apollo Sandbox UI plugin. */
export type ApolloSandboxPlugin =
	| PluginInstance<
			typeof apolloSandboxPluginMetadata & {
				readonly peers: typeof httpPeers
				readonly environment: readonly ['environment:network']
			}
	  >
	| PluginInstance<typeof apolloSandboxPluginMetadata>

/** Adds a development Sandbox page for the selected GraphQL HTTP provider. */
export const apolloSandboxPlugin = (
	options: ApolloSandboxPluginOptions,
): ApolloSandboxPlugin => {
	const normalized = normalizeApolloSandboxPluginOptions(options)
	if (!normalized.enabled) {
		return plugin({
			...apolloSandboxPluginMetadata,
			contributions: [],
		})
	}

	const routes = provideHttpEndpoints({
		contributionId: 'official-apollo-sandbox-browser-route',
		create: ({ capabilities }) => {
			const endpoint = capabilities.get(endpointRequirement)
			return httpBrowserBootstrapRoute({
				path: normalized.path,
				protocol: {
					name: 'ultimabase.apollo-sandbox',
					version: '1.0.0',
				},
				handle: () => createApolloSandboxPageResponse(endpoint.path),
			})
		},
	})
	return plugin({
		...apolloSandboxPluginMetadata,
		contributions: [routes, endpointRequirement],
		environment: ['environment:network'],
		peers: httpPeers,
	})
}
