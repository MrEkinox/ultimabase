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
	normalizeGraphiqlPluginOptions,
	type GraphiqlPluginOptions,
} from './options.js'
import { createGraphiqlPageResponse } from './page.js'

const endpointRequirement: CapabilityRequirement<
	typeof graphqlHttpEndpointCapability,
	false,
	'^1.0.0',
	'materialization'
> = requireCapability(graphqlHttpEndpointCapability, '^1.0.0')

const permissions = {
	'transport:expose':
		'Exposes the selected application GraphiQL browser route.',
} as const
const httpPeers = [
	{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
] as const

/** Names one independently configured GraphiQL UI plugin. */
export type GraphiqlPlugin =
	| PluginInstance<{
			readonly id: '@ultimabase/graphiql-plugin'
			readonly version: '0.0.0'
			readonly core: '^0.0.0'
			readonly peers: typeof httpPeers
			readonly environment: readonly ['environment:network']
	  }>
	| PluginInstance<{
			readonly id: '@ultimabase/graphiql-plugin'
			readonly version: '0.0.0'
			readonly core: '^0.0.0'
	  }>

/** Adds a development GraphiQL page for the selected GraphQL HTTP provider. */
export const graphiqlPlugin = (
	options: GraphiqlPluginOptions,
): GraphiqlPlugin => {
	const normalized = normalizeGraphiqlPluginOptions(options)
	if (!normalized.enabled) {
		const disabled = plugin({
			id: '@ultimabase/graphiql-plugin',
			version: '0.0.0',
			core: '^0.0.0',
			contributions: [],
		})
		return disabled
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
	const enabled = plugin({
		id: '@ultimabase/graphiql-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [routes, endpointRequirement],
		environment: ['environment:network'],
		peers: httpPeers,
		permissions,
	})
	return enabled
}
