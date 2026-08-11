import { expectTypeOf, test } from 'vitest'

import type { PluginSetupContext } from './setup-registries.js'
import type {
	PluginEventContributionHost,
	PluginRuntimeContributionHost,
	PluginRuntimePipelineHost,
} from './runtime-contribution-hosts.js'

test('types only exact Core-owned setup facades', () => {
	expectTypeOf<
		PluginSetupContext['runtime']
	>().toEqualTypeOf<PluginRuntimeContributionHost>()
	expectTypeOf<
		PluginSetupContext['events']
	>().toEqualTypeOf<PluginEventContributionHost>()
	expectTypeOf<
		PluginSetupContext['pipeline']
	>().toEqualTypeOf<PluginRuntimePipelineHost>()
	expectTypeOf<PluginSetupContext>().not.toHaveProperty('registries')
	expectTypeOf<PluginSetupContext>().not.toHaveProperty('services')
})
