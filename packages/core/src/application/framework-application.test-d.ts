import { Schema, stringField } from '../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import {
	createApplication,
	createServiceToken,
	definePlugin,
	type ConfiguredPluginExports,
	type ConfiguredPluginName,
	type FrameworkApplication,
	type PluginContribution,
	type PluginDefinition,
} from '../index.js'

test('infers schemas and top-level plugin exports from application options', async () => {
	const schema = Schema.define({
		className: 'TypedApplication',
		fields: { name: stringField() },
	})
	const plugin = definePlugin({
		name: 'fixture.database',
		setup: () => Promise.resolve({ dialect: 'postgres' as const }),
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
		dialect: 'postgres'
	}>()
	expectTypeOf(application.getContributions('hooks')).toEqualTypeOf<
		readonly PluginContribution[]
	>()
	// @ts-expect-error -- Only configured literal plugin names are addressable.
	application.getPlugin('fixture.missing')
})

test('includes nested composition plugins in literal-name lookup', async () => {
	const child = definePlugin({
		name: 'fixture.child',
		setup: () => ({ child: true as const }),
	})
	const parent = definePlugin({
		name: 'fixture.parent',
		plugins: [child] as const,
	})
	const application = await createApplication({
		schemas: [],
		plugins: [parent],
	})

	expectTypeOf<ConfiguredPluginName<readonly [typeof parent]>>().toEqualTypeOf<
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

	expectTypeOf<ConfiguredPluginName<WidenedPlugins>>().toEqualTypeOf<string>()
	expectTypeOf<ConfiguredPluginExports<WidenedPlugins, string>>().toBeUnknown()
})

test('infers exact required and optional application service contracts', async () => {
	interface DatabaseService {
		readonly dialect: 'postgres'
	}

	const DatabaseServiceToken = createServiceToken<DatabaseService>(
		'fixture.database-service',
	)
	const plugin = definePlugin({
		name: 'fixture.database-service',
		setup: ({ services }) => {
			services.provide(DatabaseServiceToken, { dialect: 'postgres' })
		},
	})
	const application = await createApplication({
		schemas: [],
		plugins: [plugin],
	})

	expectTypeOf(
		application.getService(DatabaseServiceToken),
	).toEqualTypeOf<DatabaseService>()
	expectTypeOf(
		application.getOptionalService(DatabaseServiceToken),
	).toEqualTypeOf<DatabaseService | undefined>()
	// Application consumers receive no writable or disposable registry surface.
	expectTypeOf(application).not.toHaveProperty('services')
	expectTypeOf(application).not.toHaveProperty('provide')
	expectTypeOf(application).not.toHaveProperty('disposeServices')
})
