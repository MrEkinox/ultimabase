import type { PluginDefinition } from '@ultimabase/core'
import { expectTypeOf } from 'vitest'

import {
	apolloSandboxPlugin,
	type ApolloSandboxPlugin,
	type ApolloSandboxPluginExports,
	type ApolloSandboxPluginOptions,
} from './index.js'

const options: ApolloSandboxPluginOptions = { environment: 'development' }
const plugin = apolloSandboxPlugin(options)

expectTypeOf(plugin).toEqualTypeOf<ApolloSandboxPlugin>()
expectTypeOf(plugin).toExtend<PluginDefinition>()
expectTypeOf<ApolloSandboxPluginExports>().toEqualTypeOf<
	Readonly<{ readonly enabled: boolean; readonly path: string }>
>()
