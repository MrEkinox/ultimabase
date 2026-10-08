import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
	withPluginTypegenConformance,
} from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { softDeletePlugin } from './index.js'

it('conforms to the public plugin and Typegen contracts', async () => {
	const suite = definePluginConformanceSuite({
		createFixture: () =>
			createPluginConformanceFixture({ subject: softDeletePlugin() }),
		expected: {
			core: '^0.0.0',
			environment: [],
			pluginId: '@ultimabase/soft-delete-plugin',
			privileges: [
				'schema:declare',
				'model:extend',
				'operation:declare',
				'runtime:constrain',
				'persistence:rewrite',
				'transport:expose',
				'typegen:reference',
			],
			version: '0.0.0',
		},
	})
	const report = await runPluginConformance(withPluginTypegenConformance(suite))

	expect(report.checks.map(({ contract }) => contract)).toContain('typegen')
})
