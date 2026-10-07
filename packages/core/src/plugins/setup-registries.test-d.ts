import { expectTypeOf, test } from 'vitest'

import type { PluginSetupContext } from './setup-registries.js'

test('types only exact Core-owned setup facades', () => {
	expectTypeOf<PluginSetupContext>().not.toHaveProperty('runtime')
	expectTypeOf<PluginSetupContext>().not.toHaveProperty('events')
	expectTypeOf<PluginSetupContext>().not.toHaveProperty('pipeline')
	expectTypeOf<PluginSetupContext>().not.toHaveProperty('registries')
	expectTypeOf<PluginSetupContext>().not.toHaveProperty('services')
})
