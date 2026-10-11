import { expectTypeOf, test } from 'vitest'

import {
	executeRestReadRequest,
	restPlugin,
	type RestPlugin,
	type RestOperationTransport,
	type RestSchemaMutationRouteDefinition,
	type RestSchemaMutationTransport,
	type RestErrorEnvelope,
	type RestReadOperationAst,
	type RestResponseErrorCode,
	type RestRouteDefinition,
	type RestSchemaRouteDefinition,
	type RestSchemaRoutes,
} from './index.js'
import type {
	ApplicationRequestExecutor,
	OperationResult,
	SchemaDefinition,
} from '@ultimabase/core'
import type {
	RequestContext,
	PluginOperationDefinition,
} from '@ultimabase/core/plugin'

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
		readonly mutations?: boolean
	}>()
	expectTypeOf<RestRouteDefinition['method']>().toExtend<string>()
	expectTypeOf<
		RestSchemaRouteDefinition['virtualFields'][string]['kind']
	>().toEqualTypeOf<string>()
	expectTypeOf<RestResponseErrorCode>().toExtend<string>()
	expectTypeOf<
		RestErrorEnvelope['error']['requestId']
	>().toEqualTypeOf<string>()
	expectTypeOf<
		RestOperationTransport['operations'][number]['kind']
	>().toEqualTypeOf<'rest-plugin-operation-route'>()
	expectTypeOf<
		RestSchemaMutationTransport['mutations'][number]
	>().toEqualTypeOf<RestSchemaMutationRouteDefinition>()
	expectTypeOf<
		RestSchemaMutationRouteDefinition['operation']
	>().toEqualTypeOf<'schemaMutation'>()
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
	restPlugin({ pagination: { defaultTake: 20, maxTake: 200 } })
	restPlugin({
		// @ts-expect-error -- the page window is `pagination` (ADR-0309).
		maxLimit: 1000,
	})
})
