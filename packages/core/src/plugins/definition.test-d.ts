import { expectTypeOf, test } from 'vitest'

import {
	definePlugin,
	type PluginExports,
	type PluginLifecycleHook,
} from '../index.js'

test('preserves literal names and synchronous setup exports', () => {
	const plugin = definePlugin({
		name: 'fixture.database',
		slot: 'database-adapter',
		setup: ({ services, schemas }) => {
			expectTypeOf(services.size).toEqualTypeOf<number>()
			expectTypeOf(schemas.size).toEqualTypeOf<number>()

			return { dialect: 'postgres' as const }
		},
		hooks: {
			connect: ({ pluginExports }) => {
				expectTypeOf(pluginExports).toEqualTypeOf<{
					readonly dialect: 'postgres'
				}>()
			},
		},
	})

	expectTypeOf(plugin.name).toEqualTypeOf<'fixture.database'>()
	expectTypeOf(plugin.slot).toEqualTypeOf<'database-adapter' | undefined>()
	expectTypeOf<PluginExports<typeof plugin>>().toEqualTypeOf<{
		readonly dialect: 'postgres'
	}>()
	expectTypeOf(plugin.hooks?.connect).toEqualTypeOf<
		| PluginLifecycleHook<{
				readonly dialect: 'postgres'
		  }>
		| undefined
	>()
})

test('unwraps asynchronous setup exports and preserves nested tuples', () => {
	const child = definePlugin({
		name: 'fixture.child',
		setup: () => Promise.resolve({ ready: true } as const),
	})
	const parent = definePlugin({
		name: 'fixture.parent',
		dependencies: ['fixture.base'] as const,
		plugins: [child] as const,
	})

	expectTypeOf<PluginExports<typeof child>>().toEqualTypeOf<{
		readonly ready: true
	}>()
	expectTypeOf<PluginExports<typeof parent>>().toEqualTypeOf<undefined>()
	expectTypeOf(parent.dependencies).toEqualTypeOf<
		readonly ['fixture.base'] | undefined
	>()
	expectTypeOf(parent.plugins).toEqualTypeOf<
		readonly [typeof child] | undefined
	>()
})

test('keeps definitions immutable and rejects incompatible metadata', () => {
	const plugin = definePlugin({ name: 'fixture.plugin' })

	// @ts-expect-error -- Plugin names remain immutable after declaration.
	plugin.name = 'fixture.changed'
	// @ts-expect-error -- Dependency names must remain strings.
	definePlugin({ name: 'fixture.invalid', dependencies: [42] })
	// @ts-expect-error -- Setup must remain callable.
	definePlugin({ name: 'fixture.invalid', setup: true })
})
