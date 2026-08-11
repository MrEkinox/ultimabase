import { Schema } from '../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import {
	createApplication,
	definePlugin,
	type ConfiguredPluginExports,
	type ConfiguredPluginId,
	type ConfiguredPluginIdentity,
	type ConfiguredPluginIdentityExports,
	type FrameworkApplication,
	type PluginDefinition,
} from '../index.js'

test('infers schemas and top-level plugin exports from application options', async () => {
	const schema = Schema.define({
		className: 'TypedApplication',
		fields: (field) => ({ name: field.string() }),
	})
	const plugin = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.database',
		setup: () => Promise.resolve({ dialect: 'postgres' as const }),
	})
	const application = await createApplication({
		access: { default: { field: true, operation: false } },
		schemas: [schema],
		plugins: [plugin],
	})

	expectTypeOf(application).toEqualTypeOf<
		FrameworkApplication<readonly [typeof schema], readonly [typeof plugin]>
	>()
	expectTypeOf(application.schemas.get('TypedApplication')).toEqualTypeOf<
		typeof schema | undefined
	>()
	expectTypeOf(application.ownsSchema(schema)).toBeBoolean()
	expectTypeOf(application.accessDefaults).toEqualTypeOf<{
		readonly field: boolean
		readonly operation: boolean
	}>()
	const unknownSchema: unknown = schema

	if (application.ownsSchema(unknownSchema)) {
		expectTypeOf(unknownSchema).toEqualTypeOf<typeof schema>()
	}
	expectTypeOf(application.getPlugin('fixture.database')).toEqualTypeOf<{
		dialect: 'postgres'
	}>()
	// @ts-expect-error -- Only configured literal plugin IDs are addressable.
	application.getPlugin('fixture.missing')
})

test('includes nested composition plugins in literal-ID lookup', async () => {
	const child = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.child',
		setup: () => ({ child: true as const }),
	})
	const parent = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.parent',
		plugins: [child] as const,
	})
	const application = await createApplication({
		schemas: [],
		plugins: [parent],
	})

	expectTypeOf<ConfiguredPluginId<readonly [typeof parent]>>().toEqualTypeOf<
		'fixture.parent' | 'fixture.child'
	>()
	expectTypeOf<
		ConfiguredPluginExports<readonly [typeof parent], 'fixture.child'>
	>().toEqualTypeOf<{ readonly child: true }>()
	expectTypeOf<
		ConfiguredPluginExports<readonly [typeof parent], 'fixture.parent'>
	>().toEqualTypeOf<undefined>()
	expectTypeOf(application.getPlugin('fixture.child')).toEqualTypeOf<{
		readonly child: true
	}>()
})

test('keeps widened plugin collections safe at runtime boundaries', () => {
	type WidenedPlugins = readonly PluginDefinition[]

	expectTypeOf<ConfiguredPluginId<WidenedPlugins>>().toEqualTypeOf<string>()
	expectTypeOf<ConfiguredPluginExports<WidenedPlugins, string>>().toBeUnknown()
})

test('infers setup exports from exact repeated plugin identities', async () => {
	const primary = definePlugin({
		pluginId: 'fixture.repeated',
		instanceId: 'primary',
		version: '1.0.0',
		core: '^0.0.0',
		setup: () => ({ connection: 'primary' as const }),
	})
	const analytics = definePlugin({
		pluginId: 'fixture.repeated',
		instanceId: 'analytics',
		version: '1.0.0',
		core: '^0.0.0',
		setup: () => ({ connection: 'analytics' as const }),
	})
	const application = await createApplication({
		schemas: [],
		plugins: [primary, analytics],
	})

	type Identities = ConfiguredPluginIdentity<
		readonly [typeof primary, typeof analytics]
	>
	expectTypeOf<Identities>().toExtend<
		| { readonly pluginId: 'fixture.repeated'; readonly instanceId?: 'primary' }
		| {
				readonly pluginId: 'fixture.repeated'
				readonly instanceId?: 'analytics'
		  }
	>()
	expectTypeOf<
		ConfiguredPluginIdentityExports<
			readonly [typeof primary, typeof analytics],
			{ readonly pluginId: 'fixture.repeated'; readonly instanceId: 'primary' }
		>
	>().toEqualTypeOf<{ readonly connection: 'primary' }>()
	expectTypeOf(
		application.getPlugin({
			pluginId: 'fixture.repeated',
			instanceId: 'analytics',
		}),
	).toEqualTypeOf<{ readonly connection: 'analytics' }>()
	// @ts-expect-error -- Exact instance lookup rejects unconfigured instance IDs.
	application.getPlugin({ pluginId: 'fixture.repeated', instanceId: 'missing' })
})

test('does not expose legacy setup resource lookup', () => {
	expectTypeOf<
		FrameworkApplication<readonly [], readonly []>
	>().not.toHaveProperty('getService')
	expectTypeOf<
		FrameworkApplication<readonly [], readonly []>
	>().not.toHaveProperty('getOptionalService')
	expectTypeOf<
		FrameworkApplication<readonly [], readonly []>
	>().not.toHaveProperty('getContributions')
})
