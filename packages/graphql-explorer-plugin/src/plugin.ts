import {
	contributeApplication,
	plugin,
	requireCapability,
	type PluginInstance,
} from '@ultimabase/core/plugin'
import {
	graphqlHttpEndpointCapability,
	graphqlIntrospectionCapability,
} from '@ultimabase/graphql-http'
import {
	httpBrowserBootstrapPathPrefix,
	httpBrowserBootstrapRoute,
	provideHttpEndpoints,
} from '@ultimabase/http-plugin'

import { createApolloSandboxPageResponse } from './apollo-sandbox-page.js'
import { createGraphiqlPageResponse } from './graphiql-page.js'
import {
	normalizeGraphqlExplorerPluginOptions,
	type GraphqlExplorerPluginOptions,
} from './options.js'

const endpointRequirement = requireCapability(
	graphqlHttpEndpointCapability,
	'^1.0.0',
)
// A served explorer refuses to start without introspection (ADR-0312).
const introspectionRequirement = requireCapability(
	graphqlIntrospectionCapability,
	'^1.0.0',
)

const httpPeers = [
	{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
] as const
const explorerPluginMetadata = {
	core: '^0.0.0',
	id: '@ultimabase/graphql-explorer-plugin',
	version: '0.0.0',
} as const

/** Names one independently configured GraphQL explorer plugin. */
export type GraphqlExplorerPlugin =
	| PluginInstance<
			typeof explorerPluginMetadata & {
				readonly peers: typeof httpPeers
				readonly environment: readonly ['environment:network']
			}
	  >
	| PluginInstance<typeof explorerPluginMetadata>

const pages = {
	'apollo-sandbox': createApolloSandboxPageResponse,
	graphiql: createGraphiqlPageResponse,
} as const

/**
 * Adds a development GraphiQL or Apollo Sandbox page for the installed
 * GraphQL HTTP provider, at `/graphiql` or `/apollo-sandbox` (ADR-0325).
 *
 * @example `graphqlExplorerPlugin({ ui: 'apollo-sandbox' })`
 */
export const graphqlExplorerPlugin = (
	options: GraphqlExplorerPluginOptions = {},
): GraphqlExplorerPlugin => {
	const normalized = normalizeGraphqlExplorerPluginOptions(options)
	// ADR-0312: whether the route is served and why, at debug level.
	const report = contributeApplication(({ logger }) => {
		logger.debug(
			normalized.enabled
				? `${normalized.ui} served at ${normalized.path} (${httpBrowserBootstrapPathPrefix}/{appId}${normalized.path} with several applications): ${normalized.reason}`
				: `${normalized.ui} not served: ${normalized.reason}`,
		)
		return { exports: undefined }
	})
	if (!normalized.enabled) {
		return plugin({ ...explorerPluginMetadata, contributions: [report] })
	}

	const page = pages[normalized.ui]
	const routes = provideHttpEndpoints({
		contributionId: 'official-graphql-explorer-browser-route',
		create: ({ capabilities }) => {
			const endpoint = capabilities.get(endpointRequirement)
			return httpBrowserBootstrapRoute({
				path: normalized.path,
				protocol: { name: `ultimabase.${normalized.ui}`, version: '1.0.0' },
				handle: () => page(endpoint.path),
			})
		},
	})
	return plugin({
		...explorerPluginMetadata,
		contributions: [
			routes,
			endpointRequirement,
			introspectionRequirement,
			report,
		],
		environment: ['environment:network'],
		peers: httpPeers,
	})
}
