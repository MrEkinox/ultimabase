import { applicationRequestExecutionCapability } from '@ultimabase/core'
import {
	contributeApplication,
	optionalCapability,
	plugin,
	provideCapability,
	requireCapability,
	withPluginPrivileges,
	type PluginInstance,
} from '@ultimabase/core/plugin'
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
import {
	httpBrowserPolicyCapability,
	normalizeHttpBrowserPolicy,
	type HttpBrowserPolicy,
	type HttpBrowserPolicyOptions,
} from './browser-policy.js'
import {
	httpRequestTimeoutMsRange,
	isHttpRequestTimeoutMs,
} from './constants.js'
import { httpContextResolverContributionsCapability } from './context.js'
import { httpEndpointContributionsCapability } from './endpoints.js'
import { httpServerCapability } from './server-capability.js'

const requestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)
const optionalEndpointContributions = optionalCapability(
	httpEndpointContributionsCapability,
	'^1.0.0',
)
const optionalContextResolverContributions = optionalCapability(
	httpContextResolverContributionsCapability,
	'^1.0.0',
)
// Read at setup only: server plugins read the HTTP application themselves.
const optionalServers = optionalCapability(httpServerCapability, '^1.0.0', {
	phase: 'setup',
})

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
			!isHttpRequestTimeoutMs(requestTimeoutMs)
		) {
			throw new TypeError(
				`HTTP plugin requestTimeoutMs must be ${httpRequestTimeoutMsRange}`,
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

const masterPermissions = {
	'authority:elevate': 'Verifies explicitly enabled HTTP Master credentials.',
} as const

/** Names the exact configured official HTTP application engine. */
export type HttpPlugin = PluginInstance<{
	readonly id: '@ultimabase/http-plugin'
	readonly exports: HttpPluginExports
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
}>

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
	return plugin({
		id: '@ultimabase/http-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			optionalContextResolverContributions,
			optionalEndpointContributions,
			// Only an explicitly enabled Master transport may elevate authority.
			normalized.masterEnabled
				? withPluginPrivileges(applicationProvider, ['authority:elevate'])
				: applicationProvider,
			provideCapability(httpBrowserPolicyCapability, {
				contributionId: 'official-http-browser-policy',
				create: () => ({ value: normalized.browser }),
			}),
			requestExecutionRequirement,
			optionalServers,
			contributeApplication(({ capabilities, logger }) => {
				const routes = capabilities
					.contributions(optionalEndpointContributions)
					.reduce((count, { value }) => count + value.length, 0)
				if (
					routes > 0 &&
					(capabilities.get(optionalServers) ?? []).length === 0
				) {
					// ADR-0313: routes nothing can answer are a visible warning.
					logger.warn(
						`HTTP has ${String(routes)} route${routes === 1 ? '' : 's'} but no server plugin: install @ultimabase/hono-server-plugin and add honoServerPlugin() to UltimaBase.use(...), or serve the HTTP application's fetch handler yourself.`,
					)
				}
				return {
					exports: immutableRecord({
						appId: normalized.appId,
						browser: normalized.browser,
						master: immutableRecord({ enabled: normalized.masterEnabled }),
						requestTimeoutMs: normalized.requestTimeoutMs,
					}),
				}
			}),
		],
		permissions: normalized.masterEnabled ? masterPermissions : undefined,
	})
}
