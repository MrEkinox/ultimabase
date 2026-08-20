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
			{
				name: 'schema:declare',
				reason: 'Declares the text FieldBuilder method.',
			},
		] as const,
		declare: ({ fields }) => {
			fields.register(method)
		},
		setup: ({ schemas }) => {
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
	expectTypeOf(plugin).not.toHaveProperty('slot')
	expectTypeOf(plugin).not.toHaveProperty('declare')
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
		dependencies: [{ pluginId: 'fixture.base', version: '^0.0.0' }] as const,
		peers: [{ pluginId: 'fixture.protocol', version: '^1.0.0' }] as const,
		plugins: [child] as const,
	})

	expectTypeOf<PluginExports<typeof child>>().toEqualTypeOf<{
		readonly ready: true
	}>()
	expectTypeOf<PluginExports<typeof parent>>().toEqualTypeOf<undefined>()
	expectTypeOf(parent.dependencies).toEqualTypeOf<
		| readonly [
				{ readonly pluginId: 'fixture.base'; readonly version: '^0.0.0' },
		  ]
		| undefined
	>()
	expectTypeOf(parent.plugins).toEqualTypeOf<
		readonly [typeof child] | undefined
	>()
	expectTypeOf(parent.peers).toEqualTypeOf<
		| readonly [
				{
					readonly pluginId: 'fixture.protocol'
					readonly version: '^1.0.0'
				},
		  ]
		| undefined
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
		// @ts-expect-error -- Named dependencies require structured identity and range metadata.
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
		// @ts-expect-error -- Static declarations must remain callable.
		declare: true,
	})
})
