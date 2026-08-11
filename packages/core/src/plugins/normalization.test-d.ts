import { expectTypeOf, test } from 'vitest'

import {
	definePlugin,
	normalizePlugins,
	type NormalizedPlugin,
} from '../index.js'

test('exposes immutable normalized plugin metadata', () => {
	const plugin = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.database',
	})
	const normalized = normalizePlugins([plugin])

	expectTypeOf(plugin).not.toHaveProperty('slot')
	expectTypeOf(normalized).toEqualTypeOf<readonly NormalizedPlugin[]>()

	// @ts-expect-error -- Normalization results are immutable snapshots.
	const mutableNormalized: NormalizedPlugin[] = normalized
	expectTypeOf(mutableNormalized).toEqualTypeOf<NormalizedPlugin[]>()
	// @ts-expect-error -- Definitions without Core provenance are rejected.
	normalizePlugins([{ name: 'fixture.forged' }])
})
