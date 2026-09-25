import {
	plugin,
	requireCapability,
	type CapabilityRequirement,
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

const endpointRequirement: CapabilityRequirement<
	typeof graphqlHttpEndpointCapability,
	false,
	'^1.0.0',
	'materialization'
> = requireCapability(graphqlHttpEndpointCapability, '^1.0.0')

const permissions = {
	'transport:expose':
		'Exposes the selected application Apollo Sandbox browser route.',
} as const
const httpPeers = [
	{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
] as const

/** Names one independently configured Apollo Sandbox UI plugin. */
export type ApolloSandboxPlugin =
	| PluginInstance<{
			readonly id: '@ultimabase/apollo-sandbox-plugin'
			readonly version: '0.0.0'
			readonly core: '^0.0.0'
			readonly peers: typeof httpPeers
			readonly environment: readonly ['environment:network']
	  }>
	| PluginInstance<{
			readonly id: '@ultimabase/apollo-sandbox-plugin'
			readonly version: '0.0.0'
			readonly core: '^0.0.0'
	  }>

/** Adds a development Sandbox page for the selected GraphQL HTTP provider. */
export const apolloSandboxPlugin = (
	options: ApolloSandboxPluginOptions,
): ApolloSandboxPlugin => {
	const normalized = normalizeApolloSandboxPluginOptions(options)
	if (!normalized.enabled) {
		const disabled = plugin({
			id: '@ultimabase/apollo-sandbox-plugin',
			version: '0.0.0',
			core: '^0.0.0',
			contributions: [],
		})
		return disabled
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
	const enabled = plugin({
		id: '@ultimabase/apollo-sandbox-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [routes, endpointRequirement],
		environment: ['environment:network'],
		peers: httpPeers,
		permissions,
	})
	return enabled
}
