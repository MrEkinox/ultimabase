import { SchemaRegistry } from '../schema/index.js'
import { describe, expect, it } from 'vitest'

import { type PluginDefinition } from './definition.js'
import { plugin as createPlugin } from './plugin.js'
import { contributeApplication } from './plugin-contributions.js'

import { PluginGraph } from './graph.js'
import { PluginLifecycleManager } from './lifecycle-manager.js'
import { normalizePlugins } from './normalization.js'
import { PluginSetupRegistries } from './setup-registries.js'

const createLifecycle = (
	plugins: readonly PluginDefinition[],
): PluginLifecycleManager =>
	new PluginLifecycleManager(
		new PluginGraph(normalizePlugins(plugins)),
		new PluginSetupRegistries(new SchemaRegistry()),
	)

describe('PluginLifecycleManager ready phase', () => {
	it('runs ready once the application is started, and fails start() with it', async () => {
		const events: string[] = []
		const ready = (failing: boolean) =>
			createPlugin({
				version: '0.0.0',
				core: '^0.0.0',
				id: `fixture.ready-${String(failing)}`,
				contributions: [
					contributeApplication(() => ({
						exports: undefined,
						startTransports: () => {
							events.push('startTransports')
						},
						// ADR-0322: seeding work runs once queries are available.
						ready: () => {
							events.push(`ready:${lifecycle.state}`)
							if (failing) throw new Error('ready failed')
						},
						dispose: () => {
							events.push('dispose')
						},
					})),
				],
			})
		let lifecycle = createLifecycle([ready(false)])

		await lifecycle.start()
		await lifecycle.dispose()
		expect(events).toStrictEqual([
			'startTransports',
			'ready:started',
			'dispose',
		])

		events.length = 0
		lifecycle = createLifecycle([ready(true)])
		await expect(lifecycle.start()).rejects.toThrow('ready failed')
		expect(lifecycle.state).toBe('disposed')
		expect(events).toStrictEqual([
			'startTransports',
			'ready:started',
			'dispose',
		])
	})
})
