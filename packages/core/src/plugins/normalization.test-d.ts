import { expectTypeOf, test } from 'vitest'

import {
	plugin as createPlugin,
	normalizePlugins,
	type NormalizedPlugin,
} from '../index.js'

test('exposes immutable normalized plugin metadata', () => {
	const plugin = createPlugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.database',
		contributions: [],
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
