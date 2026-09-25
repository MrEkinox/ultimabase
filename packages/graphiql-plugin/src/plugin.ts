import {
	definePluginModule,
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/core'
import { graphqlHttpEndpointCapability } from '@ultimabase/graphql-http'
import {
	httpBrowserBootstrapRoute,
	provideHttpEndpoints,
	type httpEndpointContributionsCapability,
} from '@ultimabase/http-plugin'

import {
	normalizeGraphiqlPluginOptions,
	type GraphiqlPluginOptions,
} from './options.js'
import { createGraphiqlPageResponse } from './page.js'

const module: PluginModule<'@ultimabase/graphiql-plugin', '0.0.0', '^0.0.0'> =
	definePluginModule({
		core: '^0.0.0',
		pluginId: '@ultimabase/graphiql-plugin',
		version: '0.0.0',
	})

const endpointRequirement: CapabilityRequirement<
	typeof graphqlHttpEndpointCapability,
	false,
	'^1.0.0',
	'materialization'
> = requireCapability(graphqlHttpEndpointCapability, '^1.0.0')

const privileges = [
	{
		name: 'transport:expose',
		reason: 'Exposes the selected application GraphiQL browser route.',
	},
] as const

type EnabledDefinition = Readonly<{
	readonly capabilities: readonly [
		CapabilityProviderDeclaration<typeof httpEndpointContributionsCapability>,
		typeof endpointRequirement,
	]
	readonly environment: readonly ['environment:network']
	readonly peers: readonly [
		Readonly<{
			readonly pluginId: '@ultimabase/http-plugin'
			readonly version: '^0.0.0'
		}>,
	]
	readonly privileges: typeof privileges
}>

type DisabledDefinition = Readonly<{ readonly setup?: never }>

/** Names one independently configured GraphiQL UI plugin. */
export type GraphiqlPlugin =
	| PluginModuleInstance<typeof module, EnabledDefinition>
	| PluginModuleInstance<typeof module, DisabledDefinition>

/** Adds a development GraphiQL page for the selected GraphQL HTTP provider. */
export const graphiqlPlugin = (
	options: GraphiqlPluginOptions,
): GraphiqlPlugin => {
	const normalized = normalizeGraphiqlPluginOptions(options)
	if (!normalized.enabled) {
		const disabled = module.plugin({} satisfies DisabledDefinition)
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
	const enabled = module.plugin({
		capabilities: [routes, endpointRequirement],
		environment: ['environment:network'],
		peers: [{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' }],
		privileges,
	} satisfies EnabledDefinition)
	return enabled
}
