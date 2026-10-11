import { UltimaBase } from '@ultimabase/core'
import {
	plugin,
	contributeApplication,
	requireCapability,
} from '@ultimabase/core/plugin'
import { describe, expect, it } from 'vitest'

import { httpApplicationCapability } from './application.js'
import { httpPlugin } from './plugin.js'

const applicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)

const consumerPlugin = () =>
	plugin({
		id: 'fixture.http-consumer',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			applicationRequirement,
			contributeApplication(({ capabilities }) => ({
				exports: {
					application: capabilities.get(applicationRequirement),
				},
			})),
		],
	})

describe('httpPlugin', () => {
	it('publishes one app ID and exact capability contract', async () => {
		const plugin = httpPlugin({ appId: 'blog' })
		expect(plugin.manifest).toMatchObject({
			identity: { pluginId: '@ultimabase/http-plugin' },
			capabilities: {
				provides: [
					{ contributionId: 'official-http-application' },
					{ contributionId: 'official-http-browser-policy' },
				],
			},
			environment: [],
			privileges: [],
		})

		const Application = UltimaBase.use(plugin).use(consumerPlugin())
		const application = new Application({
			logger: false,
			schemas: [],
		})
		await application.initialize()
		expect(application.plugin('@ultimabase/http-plugin')).toStrictEqual({
			appId: 'blog',
			browser: { enabled: false },
			master: { enabled: false },
			requestTimeoutMs: undefined,
		})
		expect(
			application.plugin('fixture.http-consumer').application,
		).toMatchObject({ appId: 'blog', protocolVersion: '1.0.0' })
		await application.dispose()
	})

	it.each([
		[{} as never, 'appId'],
		[{ appId: '' }, 'non-empty'],
		[{ appId: 'blog', master: { enabled: false } } as never, 'exactly'],
		[
			{ appId: 'blog', master: { enabled: true, extra: true } } as never,
			'exactly',
		],
		[{ appId: 'blog', requestTimeoutMs: 0 }, 'positive safe integer'],
		[{ appId: 'blog', requestTimeoutMs: 1.5 }, 'positive safe integer'],
		[
			{
				appId: 'blog',
				browser: {
					allowedHeaders: [],
					allowedMethods: ['GET'],
					allowedOrigins: ['https://console.example'],
					credentials: false,
					maxAgeSeconds: 0,
				},
			} as never,
			'non-empty array',
		],
		[{ appId: 'blog', extra: true } as never, 'Unknown'],
	])('rejects invalid options %#', (options, message) => {
		expect(() => httpPlugin(options)).toThrow(message)
	})

	it('requests elevation only for the explicitly enabled Master boundary', () => {
		const disabled = httpPlugin({ appId: 'disabled' })
		const enabled = httpPlugin({
			appId: 'enabled',
			master: { enabled: true },
			requestTimeoutMs: 2_000,
		})

		expect(disabled.manifest.privileges).toStrictEqual([])
		expect(enabled.manifest.privileges).toStrictEqual([
			{
				name: 'authority:elevate',
				reason: 'Verifies explicitly enabled HTTP Master credentials.',
			},
		])
	})

	it('keeps imports inert when the plugin is omitted', async () => {
		const application = new UltimaBase({
			logger: false,
			schemas: [],
		})
		await application.initialize()
		expect(application.pluginPrivilegeReport.plugins).toStrictEqual([])
		await application.dispose()
	})

	// Node timers clamp delays above 2^31 - 1 to 1 ms, so every request would time out at once.
	it('bounds requestTimeoutMs by the largest timer delay', () => {
		expect(() =>
			httpPlugin({ appId: 'blog', requestTimeoutMs: 2_147_483_648 }),
		).toThrow(
			'HTTP plugin requestTimeoutMs must be a positive safe integer no greater than 2147483647',
		)
		expect(() =>
			httpPlugin({ appId: 'blog', requestTimeoutMs: 2 ** 32 }),
		).toThrow('no greater than 2147483647')
		expect(
			httpPlugin({ appId: 'blog', requestTimeoutMs: 2_147_483_647 }).manifest
				.identity.pluginId,
		).toBe('@ultimabase/http-plugin')
	})
})
