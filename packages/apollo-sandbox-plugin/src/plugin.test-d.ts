import type { PluginDefinition, PluginExports } from '@ultimabase/core/plugin'
import { expectTypeOf } from 'vitest'

import {
	apolloSandboxPlugin,
	type ApolloSandboxPlugin,
	type ApolloSandboxPluginOptions,
} from './index.js'

const options: ApolloSandboxPluginOptions = { environment: 'development' }
const plugin = apolloSandboxPlugin(options)

expectTypeOf(plugin).toEqualTypeOf<ApolloSandboxPlugin>()
expectTypeOf(plugin).toExtend<PluginDefinition>()
expectTypeOf<PluginExports<typeof plugin>>().toEqualTypeOf<undefined>()
