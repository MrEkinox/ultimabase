import { applicationRequestExecutionCapability } from '@ultimabase/core'
import {
	contributeApplication,
	optionalCapability,
	plugin,
	provideCapability,
	requireCapability,
	withPluginPrivileges,
	type CapabilityProviderContribution,
	type PluginCapabilityReader,
	type PluginIdentity,
	type PluginInstance,
} from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	createHttpApplicationResource,
	httpApplicationCapability,
	type HttpApplication,
} from './application.js'
import {
	deriveHttpBrowserPolicy,
	dispatchHttpBrowserRequest,
	httpBrowserPolicyCapability,
	type HttpBrowserPolicy,
} from './browser-policy.js'
import { httpContextResolverContributionsCapability } from './context.js'
import {
	httpEndpointContributionsCapability,
	type HttpEndpointContributionsCapability,
} from './endpoints.js'
import { createHttpHealthRoute } from './health.js'
import {
	parseHttpPluginOptions,
	type HttpPluginOptions,
	type NormalizedHttpPluginOptions,
} from './options.js'
import type { HttpServerRequest } from './request-boundary.js'
import { httpServerCapability } from './server-capability.js'
import { dispatchHttpApplicationRequest } from './server-dispatch.js'

export type { HttpPluginOptions } from './options.js'

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

/** Options of one port-free `fetch` request. */
export interface HttpFetchOptions {
	/**
	 * The client's address, as a server provider passes the socket peer:
	 * `trustProxy` applies to it. Without it the request has no peer, and its
	 * address is unknown unless a trusted `X-Forwarded-For` names it (ADR-0334).
	 * @example "203.0.113.7"
	 */
	readonly remoteAddress?: string | undefined
}

/** Exposes the safe immutable HTTP configuration and port-free requests. */
export interface HttpPluginExports {
	readonly appId: string
	/** The effective CORS policy, with methods and headers derived from the installed plugins. */
	readonly browser: HttpBrowserPolicy
	readonly master: Readonly<{ readonly enabled: boolean }>
	readonly requestTimeoutMs: number
	/**
	 * Runs one request through the same path as a network request, CORS
	 * included, without a server or a port (ADR-0323). A fetch handler that
	 * knows the client address from its platform passes it as `remoteAddress`.
	 *
	 * @example
	 * ```ts
	 * const response = await ultimabase
	 *   .plugin(httpPlugin)
	 *   .fetch(new Request('http://localhost/health'), {
	 *     remoteAddress: '203.0.113.7',
	 *   })
	 * ```
	 */
	readonly fetch: (
		request: Request,
		options?: HttpFetchOptions,
	) => Promise<Response>
}

const pluginId = '@ultimabase/http-plugin' as const

/** Names the exact configured official HTTP application engine. */
export type HttpPlugin = PluginInstance<{
	readonly id: '@ultimabase/http-plugin'
	readonly exports: HttpPluginExports
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
}>

/** The `httpPlugin` factory; `ultimabase.plugin(httpPlugin)` reads its exports. */
export interface HttpPluginFactory {
	/**
	 * Installs the HTTP foundation shared by REST, GraphQL and application
	 * routes, without opening a socket; a server plugin serves it.
	 * @example `UltimaBase.use(httpPlugin({ browser: { origins: ['https://app.example.com'] } }))`
	 */
	(options?: HttpPluginOptions): HttpPlugin
	readonly pluginId: '@ultimabase/http-plugin'
}

const masterPermissions = {
	'authority:elevate': 'Verifies explicitly enabled HTTP Master credentials.',
} as const

// A port-free request has no connection; its Fetch headers stand in for the
// network evidence, with the Host a connection always carries, and the
// caller names the peer a socket would have given (ADR-0334 amendment).
const readFetchRequest = (
	request: unknown,
	options: unknown,
): HttpServerRequest => {
	if (!(request instanceof Request)) {
		throw new TypeError('HTTP plugin fetch expects a Fetch Request')
	}
	if (options !== undefined && !isPlainRecord(options)) {
		throw new TypeError('HTTP plugin fetch options must be an object')
	}
	const remoteAddress = options?.remoteAddress
	if (remoteAddress !== undefined && typeof remoteAddress !== 'string') {
		throw new TypeError('HTTP plugin fetch remoteAddress must be a string')
	}
	const headers = [...request.headers]
	return {
		originalHeaders: headers.some(([name]) => name === 'host')
			? headers
			: [['Host', new URL(request.url).host], ...headers],
		remoteAddress,
		request,
	}
}

const deriveBrowserPolicy = (
	normalized: NormalizedHttpPluginOptions,
	capabilities: PluginCapabilityReader<'materialization'>,
): HttpBrowserPolicy =>
	deriveHttpBrowserPolicy(normalized.browser, {
		credentialResolvers: capabilities
			.contributions(optionalContextResolverContributions)
			.some(({ value }) => value.length > 0),
		endpoints: [
			...normalized.routes,
			...(normalized.healthPath === undefined
				? []
				: [{ kind: 'route' as const, method: 'GET' as const }]),
			...capabilities
				.contributions(optionalEndpointContributions)
				.flatMap(({ value }) => value),
		],
		masterEnabled: normalized.masterEnabled,
	})

// The plugin's own routes join the graph first, under the HTTP plugin's identity.
const ownRoutes = (
	normalized: NormalizedHttpPluginOptions,
	owner: PluginIdentity,
	readHealth: () => Promise<'OK' | 'DEGRADED'>,
): CapabilityProviderContribution<HttpEndpointContributionsCapability> =>
	immutableRecord({
		contributionId: 'official-http-routes',
		owner,
		pluginVersion: '0.0.0',
		value: immutableArray([
			...(normalized.healthPath === undefined
				? []
				: [createHttpHealthRoute(normalized.healthPath, readHealth)]),
			...normalized.routes,
		]),
	})

const createHttpPlugin = (options: HttpPluginOptions = {}): HttpPlugin => {
	const normalized = parseHttpPluginOptions(options)
	// One application at a time owns this plugin value (ADR-0258).
	let active:
		| Readonly<{ application: HttpApplication; policy: HttpBrowserPolicy }>
		| undefined
	const applicationProvider = provideCapability(httpApplicationCapability, {
		contributionId: 'official-http-application',
		create: ({ callbacks, capabilities, logger, owner }) => {
			const requestExecution = capabilities.get(requestExecutionRequirement)
			const browserPolicy = deriveBrowserPolicy(normalized, capabilities)
			const resource = createHttpApplicationResource({
				browserPolicy,
				callbacks,
				contextContributions: capabilities.contributions(
					optionalContextResolverContributions,
				),
				endpointContributions: [
					ownRoutes(normalized, owner, () => requestExecution.health()),
					...capabilities.contributions(optionalEndpointContributions),
				],
				logger,
				owner,
				requestExecution,
				settings: normalized,
			})
			active = { application: resource.value, policy: browserPolicy }
			return {
				value: resource.value,
				dispose: () => {
					active = undefined
					resource.dispose()
				},
			}
		},
	})
	const fetch = async (
		request: Request,
		options?: HttpFetchOptions,
	): Promise<Response> => {
		const input = readFetchRequest(request, options)
		const current = active
		return current === undefined
			? dispatchHttpApplicationRequest(undefined, input)
			: dispatchHttpBrowserRequest(current.policy, input, () =>
					current.application.fetch(input),
				)
	}
	return plugin({
		id: pluginId,
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
				create: ({ capabilities }) => ({
					value: deriveBrowserPolicy(normalized, capabilities),
				}),
			}),
			requestExecutionRequirement,
			optionalServers,
			contributeApplication(({ capabilities, logger }) => {
				// The built-in health route alone needs no server.
				const routes = capabilities
					.contributions(optionalEndpointContributions)
					.reduce(
						(count, { value }) => count + value.length,
						normalized.routes.length,
					)
				if (
					routes > 0 &&
					(capabilities.get(optionalServers) ?? []).length === 0
				) {
					// ADR-0313: routes nothing can answer are a visible warning.
					logger.warn(
						`HTTP has ${String(routes)} route${routes === 1 ? '' : 's'} but no server plugin: install @ultimabase/hono-server-plugin and add honoServerPlugin() to UltimaBase.use(...), or serve the HTTP application's fetch handler yourself.`,
					)
				}
				if (active === undefined) {
					throw new TypeError('HTTP application was not materialized')
				}
				return {
					exports: immutableRecord({
						appId: normalized.appId,
						browser: active.policy,
						fetch,
						master: immutableRecord({ enabled: normalized.masterEnabled }),
						requestTimeoutMs: normalized.requestTimeoutMs,
					}),
				}
			}),
		],
		permissions: normalized.masterEnabled ? masterPermissions : undefined,
	})
}

/** Installs the Fetch-compatible HTTP foundation without opening a socket. */
export const httpPlugin: HttpPluginFactory = Object.assign(createHttpPlugin, {
	pluginId,
})
