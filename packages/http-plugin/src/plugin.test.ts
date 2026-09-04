import {
	FrameworkApplication,
	definePlugin,
	requireCapability,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { httpApplicationCapability } from './application.js'
import { httpPlugin } from './plugin.js'

const applicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)

const consumerPlugin = () =>
	definePlugin({
		pluginId: 'fixture.http-consumer',
		version: '1.0.0',
		core: '^0.0.0',
		capabilities: { requires: [applicationRequirement] },
		setup: ({ capabilities }) => ({
			application: capabilities.get(applicationRequirement),
		}),
	})

describe('httpPlugin', () => {
	it('publishes one app ID and exact capability contract', async () => {
		const plugin = httpPlugin({ appId: 'blog' })
		expect(plugin.manifest).toMatchObject({
			identity: { pluginId: '@ultimabase/http-plugin' },
			capabilities: {
				provides: [{ contributionId: 'official-http-application' }],
			},
			environment: [],
			privileges: [],
		})

		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin, consumerPlugin()],
			schemas: [],
		})
		await application.initialize()
		expect(application.getPlugin('@ultimabase/http-plugin')).toStrictEqual({
			appId: 'blog',
		})
		expect(
			application.getPlugin('fixture.http-consumer').application,
		).toMatchObject({ appId: 'blog', protocolVersion: '1.0.0' })
		await application.dispose()
	})

	it.each([
		[{} as never, 'appId'],
		[{ appId: '' }, 'non-empty'],
		[{ appId: 'blog', extra: true } as never, 'Unknown'],
	])('rejects invalid options %#', (options, message) => {
		expect(() => httpPlugin(options)).toThrow(message)
	})

	it('keeps imports inert when the plugin is omitted', async () => {
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [],
			schemas: [],
		})
		await application.initialize()
		expect(application.pluginPrivilegeReport.plugins).toStrictEqual([])
		await application.dispose()
	})
})
