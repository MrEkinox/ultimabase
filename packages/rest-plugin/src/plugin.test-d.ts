import { expectTypeOf, test } from 'vitest'

import {
	executeRestReadRequest,
	restPlugin,
	type RestPlugin,
	type RestReadOperationAst,
	type RestRouteDefinition,
	type RestSchemaRoutes,
} from './index.js'
import type {
	ApplicationRequestExecutor,
	OperationResult,
	RequestContext,
	SchemaDefinition,
} from '@ultimabase/core'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

declare const executor: ApplicationRequestExecutor
declare const context: RequestContext
declare const schema: SchemaDefinition

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
	const count = executeRestReadRequest(executor, context, schema, {
		operation: 'count',
		request: new Request('https://example.test/count'),
	})
	expectTypeOf(count).toEqualTypeOf<
		Promise<OperationResult<RestReadOperationAst<typeof schema, 'count'>>>
	>()

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
