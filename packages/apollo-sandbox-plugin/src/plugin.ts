import {
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
} from '@ultimabase/core'
import { graphqlHttpEndpointCapability } from '@ultimabase/graphql-http'
import {
	httpBrowserBootstrapRoute,
	provideHttpEndpoints,
	type httpEndpointContributionsCapability,
} from '@ultimabase/http-plugin'
import {
	definePluginModule,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'
import { immutableRecord } from '@ultimabase/shared'

import {
	normalizeApolloSandboxPluginOptions,
	type ApolloSandboxPluginOptions,
} from './options.js'
import { createApolloSandboxPageResponse } from './page.js'

const module: PluginModule<
	'@ultimabase/apollo-sandbox-plugin',
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/apollo-sandbox-plugin',
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
		reason: 'Exposes the selected application Apollo Sandbox browser route.',
	},
] as const

/** Reports the route decision without exposing application identity. */
export interface ApolloSandboxPluginExports {
	readonly enabled: boolean
	readonly path: string
}

type EnabledDefinition = Readonly<{
	readonly capabilities: Readonly<{
		readonly provides: readonly [
			CapabilityProviderDeclaration<typeof httpEndpointContributionsCapability>,
		]
		readonly requires: readonly [typeof endpointRequirement]
	}>
	readonly environment: readonly ['environment:network']
	readonly peers: readonly [
		Readonly<{
			readonly pluginId: '@ultimabase/http-plugin'
			readonly version: '^0.0.0'
		}>,
	]
	readonly privileges: typeof privileges
	readonly setup: () => ApolloSandboxPluginExports
}>

type DisabledDefinition = Readonly<{
	readonly setup: () => ApolloSandboxPluginExports
}>

/** Names one independently configured Apollo Sandbox UI plugin. */
export type ApolloSandboxPlugin =
	| PluginModuleInstance<typeof module, EnabledDefinition>
	| PluginModuleInstance<typeof module, DisabledDefinition>

/** Adds a development Sandbox page for the selected GraphQL HTTP provider. */
export const apolloSandboxPlugin = (
	options: ApolloSandboxPluginOptions,
): ApolloSandboxPlugin => {
	const normalized = normalizeApolloSandboxPluginOptions(options)
	const setup = (): ApolloSandboxPluginExports =>
		immutableRecord({ enabled: normalized.enabled, path: normalized.path })
	if (!normalized.enabled) {
		const disabled = module.plugin({ setup } satisfies DisabledDefinition)
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
	const enabled = module.plugin({
		capabilities: { provides: [routes], requires: [endpointRequirement] },
		environment: ['environment:network'],
		peers: [{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' }],
		privileges,
		setup,
	} satisfies EnabledDefinition)
	return enabled
}
