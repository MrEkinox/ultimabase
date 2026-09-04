import {
	applicationRequestExecutionCapability,
	optionalCapability,
	provideCapability,
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
} from '@ultimabase/core'
import {
	definePluginModule,
	definePluginOptionsParser,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'
import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import {
	createHttpApplicationResource,
	httpApplicationCapability,
} from './application.js'
import { httpEndpointContributionsCapability } from './endpoints.js'

const httpPluginModule: PluginModule<
	'@ultimabase/http-plugin',
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/http-plugin',
	version: '0.0.0',
})

const requestExecutionRequirement: CapabilityRequirement<
	typeof applicationRequestExecutionCapability,
	false,
	'^1.0.0',
	'materialization'
> = requireCapability(applicationRequestExecutionCapability, '^1.0.0')
const optionalEndpointContributions: CapabilityRequirement<
	typeof httpEndpointContributionsCapability,
	true,
	'^1.0.0',
	'materialization'
> = optionalCapability(httpEndpointContributionsCapability, '^1.0.0')

/** Configures the public routing identity of one HTTP-enabled application. */
export interface HttpPluginOptions {
	/** Public routing identity; this value is not a credential or authorization. */
	readonly appId: string
}

/** Exposes only safe immutable HTTP configuration to application code. */
export interface HttpPluginExports {
	readonly appId: string
}

const parseHttpPluginOptions = definePluginOptionsParser({
	name: 'HTTP plugin options',
	keys: ['appId'] as const,
	normalize: ({ appId }) => {
		assertNonEmptyString(appId, 'HTTP plugin appId')
		return { appId }
	},
})

type HttpPluginCapabilities = Readonly<{
	readonly optional: readonly [typeof optionalEndpointContributions]
	readonly provides: readonly [
		CapabilityProviderDeclaration<typeof httpApplicationCapability>,
	]
	readonly requires: readonly [typeof requestExecutionRequirement]
}>

type HttpPluginDefinition = Readonly<{
	readonly capabilities: HttpPluginCapabilities
	readonly setup: () => HttpPluginExports
}>

/** Names the exact configured official HTTP application engine. */
export type HttpPlugin = PluginModuleInstance<
	typeof httpPluginModule,
	HttpPluginDefinition
>

/** Installs the Fetch-compatible HTTP application graph without opening a socket. */
export const httpPlugin = (options: HttpPluginOptions): HttpPlugin => {
	const normalized = parseHttpPluginOptions(options)
	const applicationProvider = provideCapability(httpApplicationCapability, {
		contributionId: 'official-http-application',
		create: ({ callbacks, capabilities }) =>
			createHttpApplicationResource(
				normalized.appId,
				capabilities.contributions(optionalEndpointContributions),
				capabilities.get(requestExecutionRequirement),
				callbacks,
			),
	})
	const capabilities: HttpPluginCapabilities = {
		optional: [optionalEndpointContributions],
		provides: [applicationProvider],
		requires: [requestExecutionRequirement],
	}

	return httpPluginModule.plugin({
		capabilities,
		setup: () => immutableRecord({ appId: normalized.appId }),
	})
}
