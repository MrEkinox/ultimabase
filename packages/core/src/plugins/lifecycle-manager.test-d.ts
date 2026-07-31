import { SchemaRegistry } from '@ultimabase/schema'
import { expectTypeOf, test } from 'vitest'

import {
	definePlugin,
	normalizePlugins,
	PluginGraph,
	PluginLifecycleManager,
	PluginSetupRegistries,
	type PluginLifecycleState,
} from '../index.js'

test('exposes promise-based lifecycle operations and unknown runtime exports', () => {
	const plugin = definePlugin({
		name: 'fixture.plugin',
		setup: () => ({ ready: true as const }),
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
