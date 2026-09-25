import { expectTypeOf, test } from 'vitest'

import {
	definePluginModule,
	type PluginExports,
	type PluginModule,
	type PluginModuleInstance,
} from '../index.js'

const workflowModule = definePluginModule({
	core: '^2.0.0',
	pluginId: 'community.workflow',
	version: '1.4.0',
})

test('derives exact plugin instances from property-based definitions', () => {
	expectTypeOf(workflowModule).toEqualTypeOf<
		PluginModule<'community.workflow', '1.4.0', '^2.0.0'>
	>()

	type WorkflowDefinition = Readonly<{
		readonly instanceId: 'editorial'
		readonly peers: readonly [
			Readonly<{
				readonly pluginId: 'community.protocol'
				readonly version: '^1.0.0'
			}>,
		]
		readonly privileges: readonly [
			Readonly<{
				readonly name: 'runtime:observe'
				readonly reason: 'Records workflow timing.'
			}>,
		]
		readonly setup: () => Readonly<{ readonly ready: true }>
	}>
	type WorkflowPlugin = PluginModuleInstance<
		typeof workflowModule,
		WorkflowDefinition
	>
	const plugin: WorkflowPlugin = workflowModule.plugin({
		instanceId: 'editorial',
		peers: [{ pluginId: 'community.protocol', version: '^1.0.0' }],
		privileges: [
			{ name: 'runtime:observe', reason: 'Records workflow timing.' },
		],
		setup: () => ({ ready: true as const }),
	})

	expectTypeOf(plugin.manifest.identity.pluginId).toEqualTypeOf<
		'community.workflow'
	>()
	expectTypeOf(plugin.manifest.identity.instanceId).toEqualTypeOf<
		'editorial' | undefined
	>()
	expectTypeOf<PluginExports<WorkflowPlugin>>().toEqualTypeOf<
		Readonly<{ readonly ready: true }>
	>()
})
