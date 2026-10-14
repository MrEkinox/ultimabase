//#region starter-test
import { UltimaBase } from '@ultimabase/core'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing/plugins'
import { expect, it } from 'vitest'

// A package's own tests import its root export, as an application does.
import { starterPlugin } from '../src/starter-plugin.ts'

it('exposes setup only through its installed application', async () => {
	const Application = UltimaBase.use(starterPlugin())
	const application = await new Application({
		schemas: [],
	}).initialize()

	try {
		expect(application.plugin('community.starter')).toStrictEqual({
			ready: true,
		})
	} finally {
		await application.dispose()
	}
})

const suite = definePluginConformanceSuite({
	createFixture: () =>
		createPluginConformanceFixture({ subject: starterPlugin() }),
	expected: {
		core: '^0.0.0',
		pluginId: 'community.starter',
		version: '1.0.0',
	},
})

it('conforms to the public plugin kernel', async () => {
	// A failed contract throws a PluginConformanceError that names it.
	const report = await runPluginConformance(suite)
	expect(report.checks.map(({ contract }) => contract)).toContain('manifest')
})
//#endregion starter-test

it('stays inert until an application installs it', () => {
	// Two calls build two independent definitions; neither installs anything.
	expect(starterPlugin()).not.toBe(starterPlugin())
	expect(starterPlugin('second').manifest.identity).toStrictEqual({
		instanceId: 'second',
		pluginId: 'community.starter',
	})
})
