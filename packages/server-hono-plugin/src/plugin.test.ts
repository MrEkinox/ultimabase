import { onTestFinished, describe, expect, it } from 'vitest'
import {
	UltimaBase,
	plugin,
	provideCapability,
	type PluginDefinition,
} from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpApplicationProtocolVersion,
	httpBrowserPolicyCapability,
	httpOriginalHeaderMode,
	type HttpApplication,
} from '@ultimabase/http-plugin'
import { Hono } from 'hono'

import { honoServerPlugin } from './plugin.js'

const applicationProvider = (
	pluginId: string,
	appId: string,
): PluginDefinition =>
	plugin({
		core: '^0.0.0',
		id: pluginId,
		version: '1.0.0',
		contributions: [
			provideCapability(httpApplicationCapability, {
				contributionId: 'fixture-http-application',
				create: () => ({
					value: {
						appId,
						authority: { master: { enabled: false } },
						protocolVersion: httpApplicationProtocolVersion,
						originalHeaderMode: httpOriginalHeaderMode,
						requestTimeoutMs: undefined,
						routeGraph: {
							browserBootstraps: [],
							endpoints: [],
							mounts: [],
							routes: [],
						},
						fetch: ({ request }) =>
							Promise.resolve(
								new Response(`${appId}:${new URL(request.url).pathname}`),
							),
					} satisfies HttpApplication,
				}),
			}),
			provideCapability(httpBrowserPolicyCapability, {
				contributionId: 'fixture-http-browser-policy',
				create: () => ({ value: { enabled: false as const } }),
			}),
		],
	})

describe('honoServerPlugin', () => {
	it('declares only its exact capability use and network claim', () => {
		const plugin = honoServerPlugin({ port: 1337 })
		expect(plugin.manifest).toMatchObject({
			capabilities: {
				requires: [
					{
						phase: 'setup',
						version: '^1.0.0',
					},
					{
						phase: 'setup',
						version: '^1.0.0',
					},
				],
			},
			environment: ['environment:network'],
			identity: { pluginId: '@ultimabase/server-hono-plugin' },
			privileges: [],
		})
	})

	it('mounts only during startup and replaces a disposed application', async () => {
		const app = new Hono()
		const server = honoServerPlugin({
			app,
			browserPolicyOwner: 'ultimabase',
		})
		const First = UltimaBase.use(
			applicationProvider('fixture.first-http', 'first'),
		).use(server)
		const first = new First({
			logger: false,
			schemas: [],
		})
		onTestFinished(() => first.dispose())
		const Second = UltimaBase.use(
			applicationProvider('fixture.second-http', 'second'),
		).use(server)
		const second = new Second({
			logger: false,
			schemas: [],
		})
		onTestFinished(() => second.dispose())

		await first.initialize()
		expect(app.routes).toHaveLength(0)

		await first.start()
		const rawEnvironment = (appId: string) => ({
			incoming: {
				rawHeaders: ['X-UltimaBase-Application-Id', appId],
			},
		})
		expect(
			await (
				await app.fetch(
					new Request('http://localhost/shared'),
					rawEnvironment('first'),
				)
			).text(),
		).toBe('first:/shared')

		await first.stop()
		const removed = await app.fetch(
			new Request('http://localhost/shared'),
			rawEnvironment('first'),
		)
		expect(removed.status).toBe(401)
		await first.dispose()
		await second.start()
		expect(
			await (
				await app.fetch(
					new Request('http://localhost/shared'),
					rawEnvironment('second'),
				)
			).text(),
		).toBe('second:/shared')

		await Promise.all([first.dispose(), second.dispose()])
	})

	// ADR-0295: a `port: 0` listener must report the port the system chose.
	it('exports the managed listener address only while it listens', async () => {
		const server = honoServerPlugin({ host: '127.0.0.1', port: 0 })
		const Application = UltimaBase.use(
			applicationProvider('fixture.address-http', 'address'),
		).use(server)
		const application = new Application({
			logger: false,
			schemas: [],
		})
		onTestFinished(() => application.dispose())
		await application.initialize()
		const exports = application.plugin(server)
		expect(exports.address()).toBeUndefined()

		await application.start()
		const address = exports.address()
		expect(address).toMatchObject({ address: '127.0.0.1' })
		if (address === undefined) throw new TypeError('Missing listener address')
		expect(address.port).toBeGreaterThan(0)
		const response = await fetch(
			`http://127.0.0.1:${String(address.port)}/listening`,
			{ headers: { 'X-UltimaBase-Application-Id': 'address' } },
		)
		expect(await response.text()).toBe('address:/listening')

		await application.stop()
		expect(exports.address()).toBeUndefined()
	})

	it('reports no address for an existing Hono application', async () => {
		const server = honoServerPlugin({
			app: new Hono(),
			browserPolicyOwner: 'ultimabase',
		})
		const Application = UltimaBase.use(
			applicationProvider('fixture.external-address-http', 'external'),
		).use(server)
		const application = new Application({
			logger: false,
			schemas: [],
		})
		onTestFinished(() => application.dispose())
		await application.start()
		expect(application.plugin(server).address()).toBeUndefined()
	})

	it('fails validation when no HTTP application capability exists', () => {
		expect(() => {
			const Application = UltimaBase.use(
				honoServerPlugin({
					app: new Hono(),
					browserPolicyOwner: 'ultimabase',
				}),
			)
			const application = new Application({
				logger: false,
				schemas: [],
			})
			onTestFinished(() => application.dispose())
			return application
		}).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_MISSING' }))
	})
})
