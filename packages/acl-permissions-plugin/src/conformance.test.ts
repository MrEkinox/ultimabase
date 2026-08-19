import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { aclPlugin } from './plugin.js'

it('conforms to the public plugin kernel contracts', async () => {
	const report = await runPluginConformance(
		definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({ subject: aclPlugin() }),
			expected: {
				core: '^0.0.0',
				pluginId: 'ultimabase.acl',
				version: '0.0.0',
			},
		}),
	)

	expect(report.checks.map(({ contract }) => contract)).toContain('provenance')
})
