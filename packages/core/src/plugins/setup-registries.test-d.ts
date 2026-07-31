import { SchemaRegistry } from '@ultimabase/schema'
import { expectTypeOf, test } from 'vitest'

import {
	PluginSetupRegistries,
	createServiceToken,
	type ContributionRegistry,
	type PluginContribution,
	type PluginContributionRegistry,
	type PluginServiceRegistry,
	type PluginSetupContext,
} from '../index.js'

test('types owner-bound setup registries without erasing service contracts', () => {
	const setupRegistries = new PluginSetupRegistries(new SchemaRegistry())
	const context = setupRegistries.forPlugin('fixture.plugin')
	const PortServiceToken = createServiceToken<number>('fixture.port')

	context.services.provide(PortServiceToken, 1337)
	context.registries.commands.register('fixture.command', () => true)

	expectTypeOf(context).toEqualTypeOf<PluginSetupContext>()
	expectTypeOf(context.services).toEqualTypeOf<PluginServiceRegistry>()
	expectTypeOf(context.services.get(PortServiceToken)).toEqualTypeOf<number>()
	expectTypeOf(
		context.registries.commands,
	).toEqualTypeOf<PluginContributionRegistry>()
	expectTypeOf(
		context.registries.commands.get('fixture.command'),
	).toEqualTypeOf<PluginContribution | undefined>()
	expectTypeOf(setupRegistries.extensions).toEqualTypeOf<ContributionRegistry>()

	// @ts-expect-error -- Service values must satisfy their nominal token contract.
	context.services.provide(PortServiceToken, '1337')
})
