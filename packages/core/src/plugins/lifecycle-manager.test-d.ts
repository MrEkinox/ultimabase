import { SchemaRegistry } from '../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import {
	plugin as createPlugin,
	contributeApplication,
	normalizePlugins,
	PluginGraph,
	type PluginLifecycleState,
} from '../plugin.js'
import { PluginLifecycleManager } from './lifecycle-manager.js'
import { PluginSetupRegistries } from './setup-registries.js'

test('exposes promise-based lifecycle operations and unknown runtime exports', () => {
	const plugin = createPlugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.plugin',
		contributions: [
			contributeApplication((context) => {
				const exports = { ready: true as const }
				const lifecycleContext = { ...context, pluginExports: exports }
				void lifecycleContext
				return { exports }
			}),
		],
	})
	const lifecycle = new PluginLifecycleManager(
		new PluginGraph(normalizePlugins([plugin])),
		new PluginSetupRegistries(new SchemaRegistry()),
	)

	// Literal-aware export narrowing belongs to FrameworkApplication in issue 209.
	expectTypeOf(lifecycle.state).toEqualTypeOf<PluginLifecycleState>()
	expectTypeOf(lifecycle.setup()).toEqualTypeOf<Promise<void>>()
	expectTypeOf(lifecycle.start()).toEqualTypeOf<Promise<void>>()
	expectTypeOf(lifecycle.stop()).toEqualTypeOf<Promise<void>>()
	expectTypeOf(lifecycle.dispose()).toEqualTypeOf<Promise<void>>()
	expectTypeOf(lifecycle.getPluginExports('fixture.plugin')).toBeUnknown()
})
