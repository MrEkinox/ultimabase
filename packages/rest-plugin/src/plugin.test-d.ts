import { expectTypeOf, test } from 'vitest'

import {
	restPlugin,
	type RestPlugin,
	type RestRouteDefinition,
	type RestSchemaRoutes,
} from './index.js'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

test('preserves exact immutable REST public types', () => {
	const plugin = restPlugin({
		acknowledgeUnverifiedProtection: true,
		basePath: '/public',
		default: { bulk: { create: true }, count: true },
		instanceId: 'public',
	})

	expectTypeOf(plugin).toEqualTypeOf<RestPlugin>()
	expectTypeOf<IsAny<typeof plugin>>().toEqualTypeOf<false>()
	expectTypeOf<RestSchemaRoutes>().toExtend<{
		readonly find?: boolean
	}>()
	expectTypeOf<RestRouteDefinition['method']>().toExtend<string>()

	restPlugin({
		// @ts-expect-error -- acknowledgement is an exact affirmative literal.
		acknowledgeUnverifiedProtection: false,
	})
	restPlugin({
		default: {
			// @ts-expect-error -- set-based arbitrary batches are not REST routes.
			batch: true,
		},
	})
})
