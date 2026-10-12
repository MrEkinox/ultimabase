import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
	withPluginTypegenConformance,
} from '@ultimabase/testing/plugins'
import { expect, it } from 'vitest'

import { pgVectorPlugin } from './index.js'

it('conforms to the public plugin and Typegen contracts', async () => {
	const suite = definePluginConformanceSuite({
		createFixture: () =>
			createPluginConformanceFixture({
				subject: pgVectorPlugin(),
			}),
		expected: {
			core: '^0.0.0',
			environment: [],
			pluginId: '@ultimabase/pg-vector-plugin',
			privileges: ['schema:declare'],
			version: '0.0.0',
		},
	})
	const report = await runPluginConformance(withPluginTypegenConformance(suite))

	expect(report.checks.map(({ contract }) => contract)).toContain('typegen')
})
