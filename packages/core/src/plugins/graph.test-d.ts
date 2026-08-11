import { expectTypeOf, test } from 'vitest'

import {
	definePlugin,
	normalizePlugins,
	PluginGraph,
	type NormalizedPlugin,
} from '../index.js'

test('exposes immutable ordered graph metadata', () => {
	const plugin = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.plugin',
	})
	const graph = new PluginGraph(normalizePlugins([plugin]))

	expectTypeOf(graph.size).toEqualTypeOf<number>()
	expectTypeOf(graph.plugins).toEqualTypeOf<readonly NormalizedPlugin[]>()
	expectTypeOf(graph.get('fixture.plugin')).toEqualTypeOf<
		NormalizedPlugin | undefined
	>()
	expectTypeOf(graph.has('fixture.plugin')).toEqualTypeOf<boolean>()
	expectTypeOf(graph[Symbol.iterator]()).toEqualTypeOf<
		Iterator<NormalizedPlugin>
	>()

	// @ts-expect-error -- Resolved graph order cannot be mutated.
	const mutablePlugins: NormalizedPlugin[] = graph.plugins
	expectTypeOf(mutablePlugins).toEqualTypeOf<NormalizedPlugin[]>()
	// @ts-expect-error -- Graph entries require normalization provenance.
	new PluginGraph([{ definition: plugin }])
})
