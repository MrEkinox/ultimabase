import { onTestFinished, describe, expect, it, vi } from 'vitest'
import {
	PublicError,
	UltimaBase,
	plugin,
	contributeApplication,
	provideCapability,
	requireCapability,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type CapabilityProviderContribution,
	type PluginIdentity,
	type PluginDefinition,
} from '@ultimabase/core'

import {
	createHttpApplicationResource,
	httpApplicationCapability,
	type HttpApplication,
	type HttpServerRequest,
} from './application.js'
import {
	httpEndpointContributionsCapability,
	httpMount,
	httpRoute,
	provideHttpEndpoints,
	type HttpEndpointContributionsCapability,
} from './endpoints.js'
import { httpPlugin } from './plugin.js'
import { httpTestDatabasePlugin } from './test-database.test-support.js'
import { RequestContext } from '@ultimabase/core/plugin'

const protocol = { name: 'fixture.http', version: '1' } as const
const applicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)

const serverRequest = (
	appId: string,
	path: string,
	method = 'GET',
): HttpServerRequest => ({
	originalHeaders: [['X-UltimaBase-Application-Id', appId]],
	request: new Request(`http://localhost${path}`, { method }),
})

const endpointPlugin = (
	pluginId: string,
	definitions:
		ReturnType<typeof httpRoute> | readonly ReturnType<typeof httpRoute>[],
	instanceId?: string,
) =>
	plugin({
		id: pluginId,
		...(instanceId === undefined ? {} : { instanceId }),
		version: '1.0.0',
		core: '^0.0.0',
		permissions: {
			'transport:expose':
				'Exposes fixture routes through the HTTP application.',
		},
		contributions: [
			provideHttpEndpoints({
				contributionId: 'fixture-routes',
				create: () => definitions,
			}),
		],
	})

const serverPlugin = (capture?: (application: HttpApplication) => void) =>
	plugin({
		id: 'fixture.http-server',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			applicationRequirement,
			contributeApplication(({ capabilities }) => {
				const application = capabilities.get(applicationRequirement)
				capture?.(application)
				const exports = { application }
				return { exports }
			}),
		],
	})

const initialize = async (plugins: readonly PluginDefinition[]) => {
	let http: HttpApplication | undefined
	const Application = UltimaBase.use(
		httpTestDatabasePlugin(),
		...plugins,
		serverPlugin((value) => (http = value)),
	)
	const application = new Application({
		logger: false,
		schemas: [],
	})
	onTestFinished(() => application.dispose())
	await application.start()
	if (http === undefined)
		throw new TypeError('HTTP fixture was not materialized')
	return { application, http }
}

describe('HTTP application graph', () => {
	it('composes deterministic owned routes and dispatches Fetch values', async () => {
		const first = httpRoute({
			method: 'GET',
			path: '/first',
			protocol,
			handle: () => new Response('first'),
		})
		const second = httpRoute({
			method: 'POST',
			path: '/second',
			protocol,
			handle: () => new Response('second'),
		})
		const fixture = await initialize([
			endpointPlugin('fixture.routes', [first, second], 'primary'),
			httpPlugin({ appId: 'blog' }),
		])

		expect(
			fixture.http.routeGraph.endpoints.map((endpoint) => ({
				path: endpoint.path,
				provenance: endpoint.provenance,
			})),
		).toStrictEqual([
			{
				path: '/first',
				provenance: {
					contributionId: 'fixture-routes',
					owner: { pluginId: 'fixture.routes', instanceId: 'primary' },
					pluginVersion: '1.0.0',
					registrationIndex: 0,
				},
			},
			{
				path: '/second',
				provenance: {
					contributionId: 'fixture-routes',
					owner: { pluginId: 'fixture.routes', instanceId: 'primary' },
					pluginVersion: '1.0.0',
					registrationIndex: 1,
				},
			},
		])
		expect(
			await (await fixture.http.fetch(serverRequest('blog', '/first'))).text(),
		).toBe('first')
		expect(
			await (
				await fixture.http.fetch(serverRequest('blog', '/second', 'POST'))
			).text(),
		).toBe('second')
		const missing = await fixture.http.fetch(serverRequest('blog', '/missing'))
		expect(missing.status).toBe(404)
		expect(await missing.json()).toMatchObject({
			error: { code: 'HTTP_NOT_FOUND' },
		})
		await fixture.application.dispose()
	})

	it('answers a PublicError from a route handler as a client error (ADR-0305)', async () => {
		const refused = httpRoute({
			method: 'POST',
			path: '/refused',
			protocol,
			handle: () => {
				throw new PublicError('The webhook signature is invalid.', {
					code: 'webhook.signature',
					details: { header: 'X-Signature' },
					cause: new Error('hmac mismatch secret'),
				})
			},
		})
		const fixture = await initialize([
			endpointPlugin('fixture.refused-route', refused),
			httpPlugin({ appId: 'hooks' }),
		])

		const response = await fixture.http.fetch(
			serverRequest('hooks', '/refused', 'POST'),
		)
		const body = await response.text()

		expect(response.status).toBe(400)
		expect(JSON.parse(body)).toStrictEqual({
			error: {
				code: 'webhook.signature',
				details: { header: 'X-Signature' },
				message: 'The webhook signature is invalid.',
				requestId: response.headers.get('X-UltimaBase-Request-Id'),
				retryable: false,
			},
		})
		expect(body).not.toContain('hmac mismatch secret')
		await fixture.application.dispose()
	})

	it('routes mounts only within their exact path subtree', async () => {
		const mount = httpMount({
			path: '/graphql',
			protocol,
			handle: (request) => new Response(new URL(request.url).pathname),
		})
		const mountOwner = plugin({
			id: 'fixture.mount',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'transport:expose': 'Exposes the fixture mount.' },
			contributions: [
				provideHttpEndpoints({
					contributionId: 'mount',
					create: () => mount,
				}),
			],
		})
		const { application, http } = await initialize([
			mountOwner,
			httpPlugin({ appId: 'graph' }),
		])
		expect(
			await (await http.fetch(serverRequest('graph', '/graphql/a'))).text(),
		).toBe('/graphql/a')
		const missing = await http.fetch(serverRequest('graph', '/graphqlish'))
		expect(missing.status).toBe(404)
		await application.dispose()
	})

	it('rejects collisions before a server consumer observes a partial graph', async () => {
		const seen = vi.fn()
		const route = httpRoute({
			method: 'GET',
			path: '/collision',
			protocol,
			handle: () => new Response(),
		})
		const application = new (UltimaBase.use(
			endpointPlugin('fixture.first-routes', route),
			endpointPlugin('fixture.second-routes', route),
			httpPlugin({ appId: 'collision' }),
			serverPlugin(seen),
		))({
			logger: false,
			schemas: [],
		})
		onTestFinished(() => application.dispose())

		await expect(application.initialize()).rejects.toThrow(
			'HTTP endpoint collision',
		)
		expect(seen).not.toHaveBeenCalled()
		await application.dispose()
	})

	it('rejects forged provider values before server setup', async () => {
		const seen = vi.fn()
		const provider = plugin({
			id: 'fixture.forged-provider',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'transport:expose': 'Provides provider routes.' },
			contributions: [
				provideCapability(httpEndpointContributionsCapability, {
					contributionId: 'forged',
					create: () => ({
						value: [
							{
								kind: 'route',
								method: 'GET',
								path: '/forged',
								protocol,
								handle: () => new Response(),
							},
						] as never,
					}),
				}),
			],
		})
		const application = new (UltimaBase.use(
			provider,
			httpPlugin({ appId: 'replaced' }),
			serverPlugin(seen),
		))({
			logger: false,
			schemas: [],
		})
		onTestFinished(() => application.dispose())

		await expect(application.initialize()).rejects.toThrow(
			'must be created by httpRoute, httpMount, or httpBrowserBootstrapRoute',
		)
		expect(seen).not.toHaveBeenCalled()
		await application.dispose()
	})

	it('preserves the provider position while attributing the new route owner', async () => {
		const providerRoute = httpRoute({
			method: 'GET',
			path: '/provider',
			protocol,
			handle: () => new Response('provider'),
		})
		const provider = plugin({
			id: 'fixture.valid-provider',
			instanceId: 'green',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'transport:expose': 'Exposes the provider route.' },
			contributions: [
				provideCapability(httpEndpointContributionsCapability, {
					contributionId: 'provider-routes',
					create: () => ({ value: [providerRoute] }),
				}),
			],
		})
		const fixture = await initialize([
			provider,
			httpPlugin({ appId: 'provider-app' }),
		])

		expect(fixture.http.routeGraph.routes[0]?.provenance).toMatchObject({
			contributionId: 'provider-routes',
			owner: { pluginId: 'fixture.valid-provider', instanceId: 'green' },
			registrationIndex: 0,
		})
		expect(
			await (
				await fixture.http.fetch(serverRequest('provider-app', '/provider'))
			).text(),
		).toBe('provider')
		await fixture.application.dispose()
	})

	it('rejects competing HTTP application providers before server setup', () => {
		const seen = vi.fn()
		const competing = plugin({
			id: 'fixture.competing-http-application',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(httpApplicationCapability, {
					contributionId: 'competing-http-application',
					create: () => ({
						value: {
							appId: 'competing',
							authority: { master: { enabled: false } },
							protocolVersion: '1.0.0',
							originalHeaderMode: 'ordered-pairs',
							requestTimeoutMs: undefined,
							routeGraph: {
								browserBootstraps: [],
								endpoints: [],
								mounts: [],
								routes: [],
							},
							fetch: () => Promise.resolve(new Response()),
						},
					}),
				}),
			],
		})
		expect(() => {
			const application = new (UltimaBase.use(
				httpPlugin({ appId: 'official' }),
				competing,
				serverPlugin(seen),
			))({
				logger: false,
				schemas: [],
			})
			onTestFinished(() => application.dispose())
			return application
		}).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_CONFLICT' }))
		expect(seen).not.toHaveBeenCalled()
	})

	it('isolates applications and expires each graph with its own lifecycle', async () => {
		const route = httpRoute({
			method: 'GET',
			path: '/shared',
			protocol,
			handle: () => new Response('shared'),
		})
		const first = await initialize([
			endpointPlugin('fixture.shared', route),
			httpPlugin({ appId: 'one' }),
		])
		await first.application.dispose()
		const second = await initialize([
			endpointPlugin('fixture.shared', route),
			httpPlugin({ appId: 'two' }),
		])

		await first.application.dispose()
		const disposedResponse = await first.http.fetch(
			serverRequest('one', '/shared'),
		)
		expect(disposedResponse.status).toBe(500)
		expect(await disposedResponse.json()).toMatchObject({
			error: { code: 'HTTP_INTERNAL_ERROR' },
		})
		expect(
			await (await second.http.fetch(serverRequest('two', '/shared'))).text(),
		).toBe('shared')
		await second.application.dispose()
	})
})

describe('HTTP callback attribution', () => {
	it('re-enters a handler under its exact contributing owner', async () => {
		const owner: PluginIdentity = {
			pluginId: 'fixture.attributed-route',
			instanceId: 'blue',
		}
		let activeOwner: PluginIdentity | undefined
		let observedOwner: PluginIdentity | undefined
		const callbacks: ApplicationCallbackExecutor = {
			runApplication: (callback) => callback(),
			runPlugin: (exactOwner, callback) => {
				activeOwner = exactOwner
				try {
					return callback()
				} finally {
					activeOwner = undefined
				}
			},
		}
		const route = httpRoute({
			method: 'GET',
			path: '/owner',
			protocol,
			handle: () => {
				observedOwner = activeOwner
				return new Response('owned')
			},
		})
		const contribution: CapabilityProviderContribution<HttpEndpointContributionsCapability> =
			{
				contributionId: 'owner-route',
				owner,
				pluginVersion: '1.0.0',
				value: [route],
			}
		const requestExecution = {
			createAnonymousContext: (options: {
				readonly requestId: string
				readonly signal: AbortSignal
				readonly source: string
			}) => RequestContext.anonymous(options),
			runWithContext: <TContext extends RequestContext, TResult>(
				context: TContext,
				callback: (context: TContext) => TResult,
			) => callback(context),
			verifyMasterKey: () =>
				Promise.reject(new TypeError('Master is not used by this fixture')),
		} as unknown as ApplicationRequestExecutor
		const resource = createHttpApplicationResource({
			appId: 'owner-app',
			browserPolicy: { enabled: false },
			callbacks,
			contextContributions: [],
			endpointContributions: [contribution],
			masterEnabled: false,
			owner: { pluginId: '@ultimabase/http-plugin' },
			requestExecution,
			requestTimeoutMs: undefined,
		})

		expect(
			await (
				await resource.value.fetch(serverRequest('owner-app', '/owner'))
			).text(),
		).toBe('owned')
		expect(observedOwner).toBe(owner)
		resource.dispose()
	})
})
