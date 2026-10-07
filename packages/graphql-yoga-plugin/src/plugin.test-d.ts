import type { PluginDefinition, PluginExports } from '@ultimabase/core'
import { expectTypeOf } from 'vitest'

import {
	graphqlYogaPlugin,
	type GraphqlYogaPlugin,
	type GraphqlYogaPluginOptions,
} from './index.js'

const options: GraphqlYogaPluginOptions = {
	bodyLimit: 2_000_000,
	introspection: true,
	path: '/api/graphql',
}
const plugin = graphqlYogaPlugin(options)

expectTypeOf(plugin).toEqualTypeOf<GraphqlYogaPlugin>()
expectTypeOf(plugin).toExtend<PluginDefinition>()
expectTypeOf<PluginExports<typeof plugin>>().toEqualTypeOf<undefined>()
