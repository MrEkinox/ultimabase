import {
	applicationRequestExecutionCapability,
	definePluginModule,
	optionalCapability,
	provideCapability,
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/core'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	createHttpApplicationResource,
	httpApplicationCapability,
} from './application.js'
import { httpBrowserPolicyCapability } from './browser-policy-capability.js'
import {
	normalizeHttpBrowserPolicy,
	type HttpBrowserPolicy,
	type HttpBrowserPolicyOptions,
} from './browser-policy.js'
import { httpContextResolverContributionsCapability } from './context.js'
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
const optionalContextResolverContributions: CapabilityRequirement<
	typeof httpContextResolverContributionsCapability,
	true,
	'^1.0.0',
	'materialization'
> = optionalCapability(httpContextResolverContributionsCapability, '^1.0.0')

/** Enables the exact audited Master credential pair for one HTTP application. */
export interface HttpMasterTransportOptions {
	readonly enabled: true
}

/** Configures the public routing identity of one HTTP-enabled application. */
export interface HttpPluginOptions {
	/** Public routing identity; this value is not a credential or authorization. */
	readonly appId: string
	/** Enables one explicit server-owned cross-origin browser policy. */
	readonly browser?: HttpBrowserPolicyOptions
	/** Enables only the canonical Master header and configured MasterAuthority. */
	readonly master?: HttpMasterTransportOptions
	/** Applies one deadline signal across context resolution and route handling. */
	readonly requestTimeoutMs?: number
}

/** Exposes only safe immutable HTTP configuration to application code. */
export interface HttpPluginExports {
	readonly appId: string
	readonly browser: HttpBrowserPolicy
	readonly master: Readonly<{ readonly enabled: boolean }>
	readonly requestTimeoutMs: number | undefined
}

const parseHttpPluginOptions = definePluginOptionsParser({
	name: 'HTTP plugin options',
	keys: ['appId', 'browser', 'master', 'requestTimeoutMs'] as const,
	normalize: ({ appId, browser, master, requestTimeoutMs }) => {
		assertNonEmptyString(appId, 'HTTP plugin appId')
		if (master !== undefined) {
			if (
				!isPlainRecord(master) ||
				Reflect.ownKeys(master).length !== 1 ||
				master.enabled !== true
			) {
				throw new TypeError(
					'HTTP plugin master must be exactly { enabled: true }',
				)
			}
		}
		if (
			requestTimeoutMs !== undefined &&
			(typeof requestTimeoutMs !== 'number' ||
				!Number.isSafeInteger(requestTimeoutMs) ||
				requestTimeoutMs <= 0)
		) {
			throw new TypeError(
				'HTTP plugin requestTimeoutMs must be a positive safe integer',
			)
		}
		return {
			appId,
			browser: normalizeHttpBrowserPolicy(browser, master !== undefined),
			masterEnabled: master !== undefined,
			requestTimeoutMs,
		}
	},
})

const masterPrivileges = [
	{
		name: 'authority:elevate',
		reason: 'Verifies explicitly enabled HTTP Master credentials.',
	},
] as const
type HttpPluginPrivileges = readonly [] | typeof masterPrivileges

type HttpPluginCapabilities = readonly [
	typeof optionalContextResolverContributions,
	typeof optionalEndpointContributions,
	CapabilityProviderDeclaration<typeof httpApplicationCapability>,
	CapabilityProviderDeclaration<typeof httpBrowserPolicyCapability>,
	typeof requestExecutionRequirement,
]

type HttpPluginDefinition = Readonly<{
	readonly capabilities: HttpPluginCapabilities
	readonly privileges: HttpPluginPrivileges
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
		create: ({ callbacks, capabilities, owner }) =>
			createHttpApplicationResource({
				appId: normalized.appId,
				browserPolicy: normalized.browser,
				callbacks,
				contextContributions: capabilities.contributions(
					optionalContextResolverContributions,
				),
				endpointContributions: capabilities.contributions(
					optionalEndpointContributions,
				),
				masterEnabled: normalized.masterEnabled,
				owner,
				requestExecution: capabilities.get(requestExecutionRequirement),
				requestTimeoutMs: normalized.requestTimeoutMs,
			}),
	})
	const browserPolicyProvider = provideCapability(httpBrowserPolicyCapability, {
		contributionId: 'official-http-browser-policy',
		create: () => ({ value: normalized.browser }),
	})
	const capabilities: HttpPluginCapabilities = [
		optionalContextResolverContributions,
		optionalEndpointContributions,
		applicationProvider,
		browserPolicyProvider,
		requestExecutionRequirement,
	]
	const privileges: HttpPluginPrivileges = normalized.masterEnabled
		? masterPrivileges
		: []

	return httpPluginModule.plugin({
		capabilities,
		privileges,
		setup: () =>
			immutableRecord({
				appId: normalized.appId,
				browser: normalized.browser,
				master: immutableRecord({ enabled: normalized.masterEnabled }),
				requestTimeoutMs: normalized.requestTimeoutMs,
			}),
	})
}
