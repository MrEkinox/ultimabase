import type {
	FrameworkApplication,
	PluginDefinition,
} from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import type {
	FrameworkEngine,
	RequestEngine,
} from '../engine/framework-engine.js'
import type { RequestContext } from './request-context.js'
import {
	type ActiveFrameworkContext,
	getCurrentApplication,
	getCurrentApplicationEngine,
	getCurrentEngine,
	getCurrentFrameworkContext,
	getCurrentRequest,
	runWithRequestEngine,
} from './active-framework-context.js'

declare const requestEngine: RequestEngine

test('exposes safe widened contextual types and exact callback results', () => {
	expectTypeOf(
		getCurrentFrameworkContext(),
	).toEqualTypeOf<ActiveFrameworkContext>()
	expectTypeOf(getCurrentEngine()).toEqualTypeOf<RequestEngine>()
	expectTypeOf(getCurrentApplicationEngine()).toEqualTypeOf<FrameworkEngine>()
	expectTypeOf(getCurrentApplication()).toEqualTypeOf<
		FrameworkApplication<
			readonly SchemaDefinition[],
			readonly PluginDefinition[]
		>
	>()
	expectTypeOf(getCurrentRequest()).toEqualTypeOf<RequestContext>()
	expectTypeOf(
		runWithRequestEngine(requestEngine, () => 'completed' as const),
	).toEqualTypeOf<'completed'>()
	expectTypeOf(
		runWithRequestEngine(requestEngine, () =>
			Promise.resolve('completed' as const),
		),
	).toEqualTypeOf<Promise<'completed'>>()
})

test('requires explicit RequestEngine injection when opening a scope', () => {
	// @ts-expect-error -- A context record cannot replace the trusted engine instance.
	runWithRequestEngine({ requestEngine }, () => undefined)
	// @ts-expect-error -- Every scope requires an explicit callback.
	runWithRequestEngine(requestEngine)
})
