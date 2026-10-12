import type { PluginDefinition, PluginExports } from '@ultimabase/core/plugin'
import { expectTypeOf } from 'vitest'

import {
	graphqlExplorerPlugin,
	type GraphqlExplorerPlugin,
	type GraphqlExplorerPluginOptions,
	type GraphqlExplorerUi,
} from './index.js'

const options: GraphqlExplorerPluginOptions = {
	environment: 'development',
	ui: 'apollo-sandbox',
}
const plugin = graphqlExplorerPlugin(options)

expectTypeOf(plugin).toEqualTypeOf<GraphqlExplorerPlugin>()
expectTypeOf(plugin).toExtend<PluginDefinition>()
expectTypeOf<PluginExports<typeof plugin>>().toEqualTypeOf<undefined>()
expectTypeOf<GraphqlExplorerUi>().toEqualTypeOf<'apollo-sandbox' | 'graphiql'>()
// @ts-expect-error -- only GraphiQL and Apollo Sandbox are served.
graphqlExplorerPlugin({ ui: 'altair' })
