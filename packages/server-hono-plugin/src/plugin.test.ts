import {
	FrameworkApplication,
	definePlugin,
	provideCapability,
	type PluginDefinition,
} from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpApplicationProtocolVersion,
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
		capabilities: {
			provides: [
				provideCapability(httpApplicationCapability, {
					contributionId: 'fixture-http-application',
					create: () => ({
						value: {
							appId,
							authority: { master: { enabled: false } },
							protocolVersion: httpApplicationProtocolVersion,
							originalHeaderMode: httpOriginalHeaderMode,
							requestTimeoutMs: undefined,
							routeGraph: { endpoints: [], mounts: [], routes: [] },
							fetch: ({ request }) =>
								Promise.resolve(
									new Response(`${appId}:${new URL(request.url).pathname}`),
								),
						} satisfies HttpApplication,
					}),
				}),
			],
		},
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
				],
			},
			environment: ['environment:network'],
			identity: { pluginId: '@ultimabase/server-hono-plugin' },
			privileges: [],
		})
	})

	it('mounts only during transport startup and unmounts exact shared apps', async () => {
		const app = new Hono()
		const server = honoServerPlugin({ app })
		const first = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [applicationProvider('fixture.first-http', 'first'), server],
			schemas: [],
		})
		const second = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [applicationProvider('fixture.second-http', 'second'), server],
			schemas: [],
		})

		await first.initialize()
		expect(app.routes).toHaveLength(0)

		await Promise.all([first.start(), second.start()])
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
		expect(
			await (
				await app.fetch(
					new Request('http://localhost/shared'),
					rawEnvironment('second'),
				)
			).text(),
		).toBe('second:/shared')

		await first.stop()
		const removed = await app.fetch(
			new Request('http://localhost/shared'),
			rawEnvironment('first'),
		)
		expect(removed.status).toBe(401)
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
		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [honoServerPlugin({ app: new Hono() })],
					schemas: [],
				}),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_MISSING' }))
	})
})
