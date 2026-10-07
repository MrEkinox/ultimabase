import { expectTypeOf, test } from 'vitest'
import {
	createApplication,
	type FrameworkApplication,
} from './framework-application.js'

import {
	plugin as createPlugin,
	contributeApplication,
	type ConfiguredPluginExports,
	type ConfiguredPluginId,
	type ConfiguredPluginIdentity,
	type ConfiguredPluginIdentityExports,
	type PluginDefinition,
} from '../index.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'

test('infers schemas and top-level plugin exports from application options', async () => {
	const schema = UltimaBase.Schema.define({
		className: 'TypedApplication',
		fields: (field) => ({ name: field.string() }),
	})
	const plugin = createPlugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.database',
		contributions: [
			contributeApplication(() => ({
				exports: { dialect: 'postgres' as const },
			})),
		],
	})
	const application = await createApplication({
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
	const unknownSchema: unknown = schema

	if (application.ownsSchema(unknownSchema)) {
		expectTypeOf(unknownSchema).toEqualTypeOf<typeof schema>()
	}
	expectTypeOf(application.getPlugin('fixture.database')).toEqualTypeOf<{
		readonly dialect: 'postgres'
	}>()
	// @ts-expect-error -- Only configured literal plugin IDs are addressable.
	application.getPlugin('fixture.missing')
})

test('includes every flat configured plugin in typed lookup', async () => {
	const child = createPlugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.child',
		contributions: [
			contributeApplication(() => ({ exports: { child: true as const } })),
		],
	})
	const parent = createPlugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.parent',
		contributions: [],
	})
	const application = await createApplication({
		schemas: [],
		plugins: [parent, child],
	})

	expectTypeOf<
		ConfiguredPluginId<readonly [typeof parent, typeof child]>
	>().toEqualTypeOf<'fixture.parent' | 'fixture.child'>()
	expectTypeOf<
		ConfiguredPluginExports<
			readonly [typeof parent, typeof child],
			'fixture.child'
		>
	>().toEqualTypeOf<{ readonly child: true }>()
	expectTypeOf<
		ConfiguredPluginExports<
			readonly [typeof parent, typeof child],
			'fixture.parent'
		>
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
	const primary = createPlugin({
		id: 'fixture.repeated',
		instanceId: 'primary',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			contributeApplication(() => ({
				exports: { connection: 'primary' as const },
			})),
		],
	})
	const analytics = createPlugin({
		id: 'fixture.repeated',
		instanceId: 'analytics',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			contributeApplication(() => ({
				exports: { connection: 'analytics' as const },
			})),
		],
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
