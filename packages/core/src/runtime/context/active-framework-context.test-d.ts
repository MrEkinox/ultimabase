import { expectTypeOf, test } from 'vitest'
import { getCurrentUltimaBase } from './current-ultima-base.js'

import type { RequestEngine } from '../engine/framework-engine.js'
import type { RequestContext } from './request-context.js'
import type { UltimaBase } from '../application/ultima-base.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type { PluginSourceState } from '../../plugins/source-projections.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	getCurrentEngine,
	getCurrentRequest,
	runWithRequestEngine,
} from './active-framework-context.js'

declare const requestEngine: RequestEngine

test('exposes safe widened contextual types and exact callback results', () => {
	expectTypeOf(getCurrentEngine()).toEqualTypeOf<RequestEngine>()
	expectTypeOf(getCurrentRequest()).toEqualTypeOf<RequestContext>()
	expectTypeOf(getCurrentUltimaBase()).toEqualTypeOf<
		UltimaBase<
			readonly SchemaDefinition[],
			readonly PluginDefinition[],
			PluginSourceState
		>
	>()
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
