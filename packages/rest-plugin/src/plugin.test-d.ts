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
	type RestMethodRules,
	type RestSchemaRule,
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
		basePath: '/public',
		default: { count: true, createMany: true },
		hide: [operation],
		instanceId: 'public',
		openapi: true,
		publicWrites: true,
	})

	expectTypeOf(plugin).toEqualTypeOf<RestPlugin>()
	expectTypeOf<IsAny<typeof plugin>>().toEqualTypeOf<false>()
	expectTypeOf<RestMethodRules>().toExtend<{
		readonly findMany?: boolean
		readonly upsertOne?: boolean
	}>()
	expectTypeOf<RestSchemaRule>().toEqualTypeOf<boolean | RestMethodRules>()
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
		// @ts-expect-error -- ADR-0294 replaced the acknowledgement by publicWrites.
		acknowledgeUnverifiedProtection: true,
	})
	restPlugin({
		default: {
			// @ts-expect-error -- the keys are the schema method names (ADR-0324).
			bulk: true,
		},
	})
	restPlugin({
		// @ts-expect-error -- hiding requires exact Core tokens.
		hide: ['fixture.operation'],
	})
	restPlugin({
		// @ts-expect-error -- owners declare public operations (ADR-0324).
		operations: [operation],
	})
	restPlugin({ pagination: { defaultTake: 20, maxTake: 200 } })
	restPlugin({
		// @ts-expect-error -- the page window is `pagination` (ADR-0309).
		maxLimit: 1000,
	})
})
