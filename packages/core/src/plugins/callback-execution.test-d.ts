import { expectTypeOf, test } from 'vitest'

import type {
	ApplicationCallbackExecutor,
	ApplicationCapabilityFactoryContext,
} from '../plugin.js'

test('retains exact callback results without exposing construction or application state', () => {
	const context = null as unknown as ApplicationCapabilityFactoryContext
	const callbacks = context.callbacks

	expectTypeOf(callbacks).toEqualTypeOf<ApplicationCallbackExecutor>()
	expectTypeOf(
		callbacks.runApplication(() => 'application' as const),
	).toEqualTypeOf<'application'>()
	expectTypeOf(
		callbacks.runPlugin({ pluginId: 'fixture.callback' }, () =>
			Promise.resolve(42 as const),
		),
	).toEqualTypeOf<Promise<42>>()
	expectTypeOf(callbacks).not.toHaveProperty('application')
	expectTypeOf(callbacks).not.toHaveProperty('authority')
})
