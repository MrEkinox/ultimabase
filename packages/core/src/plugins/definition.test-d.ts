import { expectTypeOf, test } from 'vitest'

import {
	definePlugin,
	defineFieldBuilderMethod,
	stringField,
	type PluginExports,
	type PluginPrivilege,
} from '../index.js'

test('preserves literal manifests and synchronous setup exports', () => {
	const method = defineFieldBuilderMethod({
		factory: stringField,
		fieldKind: 'fixture.text',
		name: 'text',
		typegen: {
			methodType: 'TextFieldBuilderMethod',
			module: '@fixture/text-plugin',
			valueType: 'TextValue',
		},
	})
	const plugin = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.database',
		instanceId: 'primary',
		privileges: [
			{
				name: 'adapter:consume',
				reason: 'Uses the configured database adapter.',
			},
		] as const,
		slot: 'database-adapter',
		declareFields: (fields) => {
			fields.register(method)
		},
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

	expectTypeOf(
		plugin.manifest.identity.pluginId,
	).toEqualTypeOf<'fixture.database'>()
	expectTypeOf(plugin.manifest.identity.instanceId).toEqualTypeOf<
		'primary' | undefined
	>()
	expectTypeOf(
		plugin.manifest.privileges[0].name,
	).toEqualTypeOf<'adapter:consume'>()
	expectTypeOf<'adapter:consume'>().toExtend<PluginPrivilege>()
	expectTypeOf(plugin.slot).toEqualTypeOf<'database-adapter' | undefined>()
	expectTypeOf(plugin).not.toHaveProperty('declareFields')
	expectTypeOf(plugin).not.toHaveProperty('setup')
	expectTypeOf(plugin).not.toHaveProperty('hooks')
	expectTypeOf<PluginExports<typeof plugin>>().toEqualTypeOf<{
		readonly dialect: 'postgres'
	}>()
})

test('unwraps asynchronous setup exports and preserves nested tuples', () => {
	const child = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.child',
		setup: () => Promise.resolve({ ready: true } as const),
	})
	const parent = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.parent',
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
	const plugin = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.plugin',
	})

	// @ts-expect-error -- Plugin identities remain immutable after declaration.
	plugin.manifest.identity.pluginId = 'fixture.changed'
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.invalid',
		// @ts-expect-error -- Privilege requests accept only the closed vocabulary.
		privileges: [{ name: 'runtime:*', reason: 'Invalid wildcard.' }],
	})
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.invalid',
		// @ts-expect-error -- Dependency names must remain strings.
		dependencies: [42],
	})
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.invalid',
		// @ts-expect-error -- Setup must remain callable.
		setup: true,
	})
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.invalid',
		// @ts-expect-error -- Static field declarations must remain callable.
		declareFields: true,
	})
})
