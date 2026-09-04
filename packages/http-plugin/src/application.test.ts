import {
	FrameworkApplication,
	definePlugin,
	provideCapability,
	replaceCapability,
	requireCapability,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type CapabilityProviderContribution,
	type PluginIdentity,
} from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

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
	definePlugin({
		pluginId,
		...(instanceId === undefined ? {} : { instanceId }),
		version: '1.0.0',
		core: '^0.0.0',
		privileges: [
			{
				name: 'transport:expose',
				reason: 'Exposes fixture routes through the HTTP application.',
			},
		],
		capabilities: {
			provides: [
				provideHttpEndpoints({
					contributionId: 'fixture-routes',
					create: () => definitions,
				}),
			],
		},
	})

const serverPlugin = (capture?: (application: HttpApplication) => void) =>
	definePlugin({
		pluginId: 'fixture.http-server',
		version: '1.0.0',
		core: '^0.0.0',
		capabilities: { requires: [applicationRequirement] },
		setup: ({ capabilities }) => {
			const application = capabilities.get(applicationRequirement)
			capture?.(application)
			return { application }
		},
	})

const initialize = async (
	plugins: ConstructorParameters<typeof FrameworkApplication>[0]['plugins'],
) => {
	let http: HttpApplication | undefined
	const application = new FrameworkApplication({
		pluginPrivileges: { logger: false },
		plugins: [...plugins, serverPlugin((value) => (http = value))],
		schemas: [],
	})
	await application.initialize()
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
			await (await fixture.http.fetch(serverRequest('blog', '/first')))?.text(),
		).toBe('first')
		expect(
			await (
				await fixture.http.fetch(serverRequest('blog', '/second', 'POST'))
			)?.text(),
		).toBe('second')
		expect(
			await fixture.http.fetch(serverRequest('blog', '/missing')),
		).toBeUndefined()
		await fixture.application.dispose()
	})

	it('routes mounts only within their exact path subtree', async () => {
		const mount = httpMount({
			path: '/graphql',
			protocol,
			handle: (request) => new Response(new URL(request.url).pathname),
		})
		let http: HttpApplication | undefined
		const mountOwner = definePlugin({
			pluginId: 'fixture.mount',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'transport:expose', reason: 'Exposes the fixture mount.' },
			],
			capabilities: {
				provides: [
					provideHttpEndpoints({
						contributionId: 'mount',
						create: () => mount,
					}),
				],
			},
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [
				mountOwner,
				httpPlugin({ appId: 'graph' }),
				serverPlugin((value) => (http = value)),
			],
			schemas: [],
		})
		await application.initialize()
		if (http === undefined) throw new TypeError('Missing HTTP application')
		expect(
			await (await http.fetch(serverRequest('graph', '/graphql/a')))?.text(),
		).toBe('/graphql/a')
		expect(
			await http.fetch(serverRequest('graph', '/graphqlish')),
		).toBeUndefined()
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
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [
				endpointPlugin('fixture.first-routes', route),
				endpointPlugin('fixture.second-routes', route),
				httpPlugin({ appId: 'collision' }),
				serverPlugin(seen),
			],
			schemas: [],
		})

		await expect(application.initialize()).rejects.toThrow(
			'HTTP endpoint collision',
		)
		expect(seen).not.toHaveBeenCalled()
		await application.dispose()
	})

	it('rejects forged replacement values before server setup', async () => {
		const seen = vi.fn()
		const routeOwner = endpointPlugin(
			'fixture.replace-target',
			httpRoute({
				method: 'GET',
				path: '/original',
				protocol,
				handle: () => new Response(),
			}),
		)
		const replacement = definePlugin({
			pluginId: 'fixture.forged-replacement',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{
					name: 'capability:replace',
					reason: 'Exercises replacement validation.',
				},
				{ name: 'transport:expose', reason: 'Provides replacement routes.' },
			],
			capabilities: {
				replaces: [
					replaceCapability(httpEndpointContributionsCapability, {
						contributionId: 'forged',
						target: {
							owner: { pluginId: 'fixture.replace-target' },
							contributionId: 'fixture-routes',
						},
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
			},
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [
				routeOwner,
				replacement,
				httpPlugin({ appId: 'replaced' }),
				serverPlugin(seen),
			],
			schemas: [],
		})

		await expect(application.initialize()).rejects.toThrow(
			'must be created by httpRoute or httpMount',
		)
		expect(seen).not.toHaveBeenCalled()
		await application.dispose()
	})

	it('preserves the replaced position while attributing the new route owner', async () => {
		const original = endpointPlugin(
			'fixture.valid-replace-target',
			httpRoute({
				method: 'GET',
				path: '/original',
				protocol,
				handle: () => new Response('original'),
			}),
		)
		const replacementRoute = httpRoute({
			method: 'GET',
			path: '/replacement',
			protocol,
			handle: () => new Response('replacement'),
		})
		const replacement = definePlugin({
			pluginId: 'fixture.valid-replacement',
			instanceId: 'green',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'capability:replace', reason: 'Exercises exact replacement.' },
				{ name: 'transport:expose', reason: 'Exposes the replacement route.' },
			],
			capabilities: {
				replaces: [
					replaceCapability(httpEndpointContributionsCapability, {
						contributionId: 'replacement-routes',
						target: {
							owner: { pluginId: 'fixture.valid-replace-target' },
							contributionId: 'fixture-routes',
						},
						create: () => ({ value: [replacementRoute] }),
					}),
				],
			},
		})
		const fixture = await initialize([
			original,
			replacement,
			httpPlugin({ appId: 'replacement-app' }),
		])

		expect(fixture.http.routeGraph.routes[0]?.provenance).toMatchObject({
			contributionId: 'replacement-routes',
			owner: { pluginId: 'fixture.valid-replacement', instanceId: 'green' },
			registrationIndex: 0,
		})
		expect(
			await (
				await fixture.http.fetch(
					serverRequest('replacement-app', '/replacement'),
				)
			)?.text(),
		).toBe('replacement')
		await fixture.application.dispose()
	})

	it('rejects competing HTTP application providers before server setup', () => {
		const seen = vi.fn()
		const competing = definePlugin({
			pluginId: 'fixture.competing-http-application',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(httpApplicationCapability, {
						contributionId: 'competing-http-application',
						create: () => ({
							value: {
								appId: 'competing',
								protocolVersion: '1.0.0',
								originalHeaderMode: 'ordered-pairs',
								routeGraph: { endpoints: [], mounts: [], routes: [] },
								fetch: () => Promise.resolve(undefined),
							},
						}),
					}),
				],
			},
		})
		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [
						httpPlugin({ appId: 'official' }),
						competing,
						serverPlugin(seen),
					],
					schemas: [],
				}),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_CONFLICT' }))
		expect(seen).not.toHaveBeenCalled()
	})

	it('isolates applications and expires each graph with its own lifecycle', async () => {
		const route = httpRoute({
			method: 'GET',
			path: '/shared',
			protocol,
			handle: () => new Response('shared'),
		})
		const [first, second] = await Promise.all([
			initialize([
				endpointPlugin('fixture.shared', route),
				httpPlugin({ appId: 'one' }),
			]),
			initialize([
				endpointPlugin('fixture.shared', route),
				httpPlugin({ appId: 'two' }),
			]),
		])

		await first.application.dispose()
		await expect(
			first.http.fetch(serverRequest('one', '/shared')),
		).rejects.toThrow('no longer available')
		expect(
			await (await second.http.fetch(serverRequest('two', '/shared')))?.text(),
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
		const resource = createHttpApplicationResource(
			'owner-app',
			[contribution],
			{} as ApplicationRequestExecutor,
			callbacks,
		)

		expect(
			await (
				await resource.value.fetch(serverRequest('owner-app', '/owner'))
			)?.text(),
		).toBe('owned')
		expect(observedOwner).toBe(owner)
		resource.dispose()
	})
})
