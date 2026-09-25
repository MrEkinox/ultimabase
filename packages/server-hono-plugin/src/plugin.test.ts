import { onTestFinished } from 'vitest'
import {
	FrameworkApplication,
	definePlugin,
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
import { describe, expect, it } from 'vitest'

import { honoServerPlugin } from './plugin.js'

const applicationProvider = (
	pluginId: string,
	appId: string,
): PluginDefinition =>
	definePlugin({
		core: '^0.0.0',
		pluginId,
		version: '1.0.0',
		capabilities: [
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
		const first = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [applicationProvider('fixture.first-http', 'first'), server],
			schemas: [],
		})
		onTestFinished(() => first.dispose())
		const second = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [applicationProvider('fixture.second-http', 'second'), server],
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

	it('fails validation when no HTTP application capability exists', () => {
		expect(() => {
			const application = new FrameworkApplication({
				pluginPrivileges: { logger: false },
				plugins: [
					honoServerPlugin({
						app: new Hono(),
						browserPolicyOwner: 'ultimabase',
					}),
				],
				schemas: [],
			})
			onTestFinished(() => application.dispose())
			return application
		}).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_MISSING' }))
	})
})
