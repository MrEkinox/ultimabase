import { Hono } from 'hono'
import { expectTypeOf, test } from 'vitest'

import {
	honoServerPlugin,
	type ExistingHonoServerPluginOptions,
	type HonoServerPlugin,
	type ManagedHonoServerPluginOptions,
} from './index.js'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

test('preserves managed and application-specific Hono option types', () => {
	const managed: ManagedHonoServerPluginOptions = {
		host: '127.0.0.1',
		port: 1337,
	}
	expectTypeOf(honoServerPlugin(managed)).toEqualTypeOf<HonoServerPlugin>()
	expectTypeOf<IsAny<HonoServerPlugin>>().toEqualTypeOf<false>()

	const app = new Hono<{ Bindings: { traceId: string } }>()
	const external: ExistingHonoServerPluginOptions<{
		Bindings: { traceId: string }
	}> = { app, browserPolicyOwner: 'external' }
	expectTypeOf(honoServerPlugin(external)).toEqualTypeOf<HonoServerPlugin>()

	// @ts-expect-error -- an external app owns its listener address.
	honoServerPlugin({ app, port: 1337 })
	// @ts-expect-error -- only Hono applications satisfy the external contract.
	honoServerPlugin({ app: { fetch: () => new Response() } })
	// @ts-expect-error -- existing applications require one explicit CORS owner.
	honoServerPlugin({ app })
	// @ts-expect-error -- managed listeners always use UltimaBase browser policy ownership.
	honoServerPlugin({ browserPolicyOwner: 'external' })
})
