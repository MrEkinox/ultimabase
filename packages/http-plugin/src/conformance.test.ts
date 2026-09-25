import { definePlugin, requireCapability } from '@ultimabase/core'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing'
import { describe, expect, it } from 'vitest'

import {
	httpApplicationCapability,
	type HttpApplication,
} from './application.js'
import { httpRoute, provideHttpEndpoints } from './endpoints.js'
import { httpPlugin } from './plugin.js'
import { httpTestDatabasePlugin } from './test-database.test-support.js'

const applicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)

const createFixture = () => {
	const routes = definePlugin({
		pluginId: 'fixture.http-conformance-routes',
		version: '1.0.0',
		core: '^0.0.0',
		privileges: [
			{ name: 'transport:expose', reason: 'Exposes the conformance route.' },
		],
		capabilities: [
			provideHttpEndpoints({
				contributionId: 'conformance-route',
				create: () =>
					httpRoute({
						method: 'GET',
						path: '/conformance',
						protocol: { name: 'fixture.conformance', version: '1' },
						handle: () => new Response('conformant'),
					}),
			}),
		],
	})
	const server = definePlugin({
		pluginId: 'fixture.http-conformance-server',
		version: '1.0.0',
		core: '^0.0.0',
		capabilities: [applicationRequirement],
		setup: ({ capabilities }) => ({
			http: capabilities.get(applicationRequirement),
		}),
	})

	return createPluginConformanceFixture({
		subject: httpPlugin({ appId: 'conformance-app' }),
		supportPlugins: [httpTestDatabasePlugin(), routes, server],
	})
}

describe('@ultimabase/http-plugin conformance', () => {
	it('passes kernel and fake-server transport contracts', async () => {
		const suite = definePluginConformanceSuite({
			createFixture,
			expected: {
				core: '^0.0.0',
				environment: [],
				pluginId: '@ultimabase/http-plugin',
				privileges: [],
				version: '0.0.0',
			},
		}).check('transport', async ({ createUltimaBase }) => {
			const { ultimabase } = createUltimaBase()
			await ultimabase.start()
			const serverExports = ultimabase.application.getPlugin(
				'fixture.http-conformance-server',
			) as Readonly<{ readonly http: HttpApplication }>
			const http = serverExports.http
			const response = await http.fetch({
				originalHeaders: [['X-UltimaBase-Application-Id', 'conformance-app']],
				request: new Request('http://localhost/conformance'),
			})
			expect(await response.text()).toBe('conformant')
		})
		const report = await runPluginConformance(suite)

		expect(report.checks).toEqual(
			expect.arrayContaining([
				{ contract: 'capability-contracts', status: 'passed' },
				{ contract: 'lifecycle-cleanup', status: 'passed' },
				{ contract: 'application-isolation', status: 'passed' },
				{ contract: 'transport', status: 'passed' },
			]),
		)
	})
})
