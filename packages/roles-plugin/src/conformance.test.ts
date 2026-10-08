import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { rolesPlugin } from './plugin.js'

it('conforms to the public plugin kernel contracts', async () => {
	const report = await runPluginConformance(
		definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({ subject: rolesPlugin() }),
			expected: {
				core: '^0.0.0',
				environment: [],
				pluginId: '@ultimabase/roles-plugin',
				privileges: [
					'schema:declare',
					'runtime:intercept',
					'event:publish',
					'authority:elevate',
				],
				version: '0.0.0',
			},
		}),
	)

	expect(report.checks.map(({ contract }) => contract)).toContain(
		'capability-contracts',
	)
})
