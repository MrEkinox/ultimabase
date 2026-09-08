import type { PluginDefinition } from '@ultimabase/core'
import { expectTypeOf } from 'vitest'

import {
	graphiqlPlugin,
	type GraphiqlPlugin,
	type GraphiqlPluginExports,
	type GraphiqlPluginOptions,
} from './index.js'

const options: GraphiqlPluginOptions = { environment: 'development' }
const plugin = graphiqlPlugin(options)

expectTypeOf(plugin).toEqualTypeOf<GraphiqlPlugin>()
expectTypeOf(plugin).toExtend<PluginDefinition>()
expectTypeOf<GraphiqlPluginExports>().toEqualTypeOf<
	Readonly<{ readonly enabled: boolean; readonly path: string }>
>()
