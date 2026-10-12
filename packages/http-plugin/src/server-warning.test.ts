import { UltimaBase, type Logger } from '@ultimabase/core'
import {
	plugin,
	provideCapability,
	type PluginDefinition,
} from '@ultimabase/core/plugin'
import { describe, expect, it, vi } from 'vitest'

import { httpRoute, provideHttpEndpoints } from './endpoints.js'
import { httpPlugin } from './plugin.js'
import { httpServerCapability } from './server-capability.js'
import { httpTestDatabasePlugin } from './test-database.test-support.js'

const routes = plugin({
	id: 'fixture.http-warning-routes',
	version: '1.0.0',
	core: '^0.0.0',
	permissions: { 'transport:expose': 'Exposes warning fixture routes.' },
	contributions: [
		provideHttpEndpoints({
			contributionId: 'warning-routes',
			create: () => [
				httpRoute({
					method: 'GET',
					path: '/one',
					protocol: { name: 'fixture.http-warning', version: '1' },
					handle: () => new Response(),
				}),
				httpRoute({
					method: 'GET',
					path: '/two',
					protocol: { name: 'fixture.http-warning', version: '1' },
					handle: () => new Response(),
				}),
			],
		}),
	],
})
const server = plugin({
	id: 'fixture.http-warning-server',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		provideCapability(httpServerCapability, {
			contributionId: 'fixture-server',
			create: () => ({ value: { name: 'fixture.http-warning-server' } }),
		}),
	],
})

const start = async (...plugins: readonly PluginDefinition[]) => {
	const warn = vi.fn<Logger['warn']>()
	const ultimabase = new (UltimaBase.use(...plugins))({
		logger: {
			debug: () => undefined,
			error: () => undefined,
			info: () => undefined,
			warn,
		},
		schemas: [],
	})
	await ultimabase.start()
	await ultimabase.dispose()
	return warn
}

// ADR-0313 decision 3: routes nothing can answer are a visible warning.
describe('HTTP without a server plugin', () => {
	it('warns once at the default level, naming the plugin and the fix', async () => {
		const warn = await start(
			httpTestDatabasePlugin(),
			httpPlugin({ appId: 'warning-app' }),
			routes,
		)

		expect(warn).toHaveBeenCalledExactlyOnceWith(
			"[@ultimabase/http-plugin] HTTP has 2 routes but no server plugin: install @ultimabase/hono-server-plugin and add honoServerPlugin() to UltimaBase.use(...), or serve the HTTP application's fetch handler yourself.",
		)
	})

	it('stays quiet with a server plugin or without routes', async () => {
		await expect(
			start(
				httpTestDatabasePlugin(),
				httpPlugin({ appId: 'served-app' }),
				routes,
				server,
			),
		).resolves.not.toHaveBeenCalled()
		await expect(
			start(httpTestDatabasePlugin(), httpPlugin({ appId: 'empty-app' })),
		).resolves.not.toHaveBeenCalled()
	})
})
