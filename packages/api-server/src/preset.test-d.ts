import { UltimaBase } from '@ultimabase/core'
import type { GraphqlExplorerPlugin } from '@ultimabase/graphql-explorer-plugin'
import type { GraphqlPlugin } from '@ultimabase/graphql-plugin'
import type { GraphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import type { HonoServerPlugin } from '@ultimabase/hono-server-plugin'
import type { HttpPlugin } from '@ultimabase/http-plugin'
import type { TransportExposureOptions } from '@ultimabase/plugin-kit'
import type { RestPlugin } from '@ultimabase/rest-plugin'
import { expectTypeOf, test } from 'vitest'

import {
	apiServer,
	type ApiServerOptions,
	type ApiServerPlugins,
} from './index.js'

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

// ADR-0347 decision 3 and amendment item 4: hide, pagination, publicWrites.
test('types the shared exposure options of every transport', () => {
	apiServer({
		hide: [],
		pagination: { defaultTake: 20, maxTake: 100 },
		publicWrites: true,
		rest: { pagination: { maxTake: 50 } },
		graphql: { publicWrites: false },
	})
	expectTypeOf<ApiServerOptions['pagination']>().toEqualTypeOf<
		TransportExposureOptions['pagination']
	>()
	expectTypeOf<ApiServerOptions['hide']>().toEqualTypeOf<
		TransportExposureOptions['hide']
	>()
	expectTypeOf<ApiServerOptions['publicWrites']>().toEqualTypeOf<
		boolean | undefined
	>()
	apiServer({
		// @ts-expect-error -- a page size is a number.
		pagination: { maxTake: '100' },
	})
})

// ADR-0347 amendment item 4: one shared default for both transports.
test('types the shared default of every transport', () => {
	apiServer({
		default: { count: true, write: false },
		graphql: { default: false },
		rest: true,
	})
	apiServer({ default: true })
	expectTypeOf<ApiServerOptions['default']>().toEqualTypeOf<
		NonNullable<TransportExposureOptions['default']> | undefined
	>()
	apiServer({
		// @ts-expect-error -- plugin commands are named in `.with`, never in `default`.
		default: { archiveOne: true },
	})
	apiServer({
		// @ts-expect-error -- not a key of the vocabulary.
		default: { list: true },
	})
})
