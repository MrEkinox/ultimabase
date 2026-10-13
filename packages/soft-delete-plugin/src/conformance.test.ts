import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing/plugins'
import { expect, it } from 'vitest'

import { softDeletePlugin } from './index.js'

it('conforms to the public plugin contracts', async () => {
	const suite = definePluginConformanceSuite({
		createFixture: () =>
			createPluginConformanceFixture({ subject: softDeletePlugin() }),
		expected: {
			core: '^0.0.0',
			environment: [],
			pluginId: '@ultimabase/soft-delete-plugin',
			// No transport binding: transports expose commands by rule (ADR-0325).
			privileges: [
				'schema:declare',
				'model:extend',
				'operation:declare',
				'runtime:constrain',
				'persistence:rewrite',
			],
			version: '0.0.0',
		},
	})
	const report = await runPluginConformance(suite)

	expect(report.checks.map(({ contract }) => contract)).toContain('manifest')
})
