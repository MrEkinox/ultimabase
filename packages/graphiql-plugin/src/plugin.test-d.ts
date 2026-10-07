import type { PluginDefinition, PluginExports } from '@ultimabase/core'
import { expectTypeOf } from 'vitest'

import {
	graphiqlPlugin,
	type GraphiqlPlugin,
	type GraphiqlPluginOptions,
} from './index.js'

const options: GraphiqlPluginOptions = { environment: 'development' }
const plugin = graphiqlPlugin(options)

expectTypeOf(plugin).toEqualTypeOf<GraphiqlPlugin>()
expectTypeOf(plugin).toExtend<PluginDefinition>()
expectTypeOf<PluginExports<typeof plugin>>().toEqualTypeOf<undefined>()
