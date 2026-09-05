import { expectTypeOf, test } from 'vitest'

import {
	executeRestReadRequest,
	restPlugin,
	type RestPlugin,
	type RestOperationTransport,
	type RestReadOperationAst,
	type RestRouteDefinition,
	type RestSchemaRoutes,
} from './index.js'
import type {
	ApplicationRequestExecutor,
	OperationResult,
	PluginOperationDefinition,
	RequestContext,
	SchemaDefinition,
} from '@ultimabase/core'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

declare const executor: ApplicationRequestExecutor
declare const context: RequestContext
declare const schema: SchemaDefinition
declare const operation: PluginOperationDefinition

test('preserves exact immutable REST public types', () => {
	const plugin = restPlugin({
		acknowledgeUnverifiedProtection: true,
		basePath: '/public',
		default: { bulk: { create: true }, count: true },
		instanceId: 'public',
		operations: [operation],
	})

	expectTypeOf(plugin).toEqualTypeOf<RestPlugin>()
	expectTypeOf<IsAny<typeof plugin>>().toEqualTypeOf<false>()
	expectTypeOf<RestSchemaRoutes>().toExtend<{
		readonly find?: boolean
	}>()
	expectTypeOf<RestRouteDefinition['method']>().toExtend<string>()
	expectTypeOf<
		RestOperationTransport['operations'][number]['kind']
	>().toEqualTypeOf<'rest-plugin-operation-route'>()
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
	restPlugin({
		// @ts-expect-error -- operation exposure requires exact Core tokens.
		operations: ['fixture.operation'],
	})
})
