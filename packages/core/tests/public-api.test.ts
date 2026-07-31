import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/core public entry point', () => {
	it('exports only the implemented framework error surface', () => {
		// Type-only contracts must not create runtime export placeholders.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'ContributionRegistry',
			'FrameworkError',
			'PluginGraph',
			'PluginLifecycleManager',
			'PluginSetupRegistries',
			'ServiceRegistry',
			'createServiceToken',
			'definePlugin',
			'frameworkErrorCodes',
			'normalizePlugins',
		])
	})
})
