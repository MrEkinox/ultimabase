import { UltimaBase } from '@ultimabase/core'
import type { GraphqlExplorerPlugin } from '@ultimabase/graphql-explorer-plugin'
import type { GraphqlPlugin } from '@ultimabase/graphql-plugin'
import type { GraphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import type { HonoServerPlugin } from '@ultimabase/hono-server-plugin'
import type { HttpPlugin } from '@ultimabase/http-plugin'
import type { RestPlugin } from '@ultimabase/rest-plugin'
import { expectTypeOf, test } from 'vitest'

import { apiServer, type ApiServerPlugins } from './index.js'

test('types the exact plugin tuple of each option set', () => {
	expectTypeOf(apiServer()).toEqualTypeOf<
		readonly [HttpPlugin, HonoServerPlugin]
	>()
	expectTypeOf(apiServer({ graphql: true, rest: true })).toEqualTypeOf<
		readonly [
			HttpPlugin,
			RestPlugin,
			GraphqlPlugin,
			GraphqlYogaPlugin,
			HonoServerPlugin,
		]
	>()
	expectTypeOf(
		apiServer({ graphql: { explorer: 'graphiql' }, server: false }),
	).toEqualTypeOf<
		readonly [
			HttpPlugin,
			GraphqlPlugin,
			GraphqlYogaPlugin,
			GraphqlExplorerPlugin,
		]
	>()
	expectTypeOf<ApiServerPlugins<{ rest: false }>>().toEqualTypeOf<
		readonly [HttpPlugin, HonoServerPlugin]
	>()
})

test('keeps every plugin projection on the configured factory', () => {
	const App = UltimaBase.use(apiServer({ graphql: true, rest: true }))
	App.Schema.define({
		className: 'PresetTask',
		fields: (field) => ({ title: field.string() }),
	}).with({ graphql: { count: true, typeName: 'Task' }, rest: { count: true } })
	App.Schema.define({
		className: 'PresetInvalid',
		fields: () => ({}),
	}).with({
		// @ts-expect-error -- the keys are the schema method names.
		graphql: { get: true },
	})
	apiServer({
		rest: {
			// @ts-expect-error -- each option object keeps its plugin's type.
			basePath: 1,
		},
	})
})
