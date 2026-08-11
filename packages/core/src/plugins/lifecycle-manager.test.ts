import { SchemaRegistry } from '../schema/index.js'
import { describe, expect, it } from 'vitest'

import { definePlugin, type PluginDefinition } from './definition.js'
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

describe('PluginLifecycleManager', () => {
	it('runs every phase in dependency order and teardown in reverse order', async () => {
		const events: string[] = []
		const dependency = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.dependency',
			setup: () => {
				events.push('setup:dependency')

				return { name: 'dependency' }
			},
			hooks: {
				connect: ({ pluginExports }) => {
					events.push(`connect:${pluginExports.name}`)
				},
				prepareSchema: ({ pluginExports }) => {
					events.push(`prepareSchema:${pluginExports.name}`)
				},
				startRuntime: ({ pluginExports }) => {
					events.push(`startRuntime:${pluginExports.name}`)
				},
				startTransports: ({ pluginExports }) => {
					events.push(`startTransports:${pluginExports.name}`)
				},
				stop: ({ pluginExports }) => {
					events.push(`stop:${pluginExports.name}`)
				},
				dispose: ({ pluginExports }) => {
					events.push(`dispose:${pluginExports.name}`)
				},
			},
		})
		const consumer = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.consumer',
			dependencies: ['fixture.dependency'],
			setup: async () => {
				await Promise.resolve()
				events.push('setup:consumer')

				return { name: 'consumer' }
			},
			hooks: {
				connect: ({ pluginExports }) => {
					events.push(`connect:${pluginExports.name}`)
				},
				prepareSchema: ({ pluginExports }) => {
					events.push(`prepareSchema:${pluginExports.name}`)
				},
				startRuntime: ({ pluginExports }) => {
					events.push(`startRuntime:${pluginExports.name}`)
				},
				startTransports: ({ pluginExports }) => {
					events.push(`startTransports:${pluginExports.name}`)
				},
				stop: ({ pluginExports }) => {
					events.push(`stop:${pluginExports.name}`)
				},
				dispose: ({ pluginExports }) => {
					events.push(`dispose:${pluginExports.name}`)
				},
			},
		})
		// Reversed configuration proves dependencies, not input position, lead setup.
		const lifecycle = createLifecycle([consumer, dependency])

		await lifecycle.start()
		await lifecycle.stop()
		await lifecycle.dispose()

		expect(events).toStrictEqual([
			'setup:dependency',
			'setup:consumer',
			'connect:dependency',
			'connect:consumer',
			'prepareSchema:dependency',
			'prepareSchema:consumer',
			'startRuntime:dependency',
			'startRuntime:consumer',
			'startTransports:dependency',
			'startTransports:consumer',
			'stop:consumer',
			'stop:dependency',
			'dispose:consumer',
			'dispose:dependency',
		])
		expect(lifecycle.state).toBe('disposed')
	})

	it('keeps setup, start, stop, and dispose idempotent', async () => {
		const calls = { setup: 0, connect: 0, stop: 0, dispose: 0 }
		const exportedValue = { port: 1337 }
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.server',
			setup: () => {
				calls.setup += 1

				return exportedValue
			},
			hooks: {
				connect: ({ pluginExports }) => {
					expect(pluginExports).toBe(exportedValue)
					calls.connect += 1
				},
				stop: () => {
					calls.stop += 1
				},
				dispose: () => {
					calls.dispose += 1
				},
			},
		})
		const lifecycle = createLifecycle([plugin])
		const setup = lifecycle.setup()

		expect(lifecycle.setup()).toBe(setup)
		await setup
		expect(lifecycle.state).toBe('ready')
		expect(lifecycle.getPluginExports('fixture.server')).toBe(exportedValue)
		const start = lifecycle.start()

		expect(lifecycle.start()).toBe(start)
		await start
		const stop = lifecycle.stop()

		expect(lifecycle.stop()).toBe(stop)
		await stop
		const dispose = lifecycle.dispose()

		expect(lifecycle.dispose()).toBe(dispose)
		await dispose
		await lifecycle.dispose()
		expect(calls).toStrictEqual({ setup: 1, connect: 1, stop: 1, dispose: 1 })
		expect(() => lifecycle.start()).toThrow(
			new TypeError('Cannot start a disposed plugin lifecycle'),
		)
		expect(() => lifecycle.setup()).toThrow(
			new TypeError('Cannot setup a disposed plugin lifecycle'),
		)
	})

	it('cleans a partial start in reverse order before rejecting', async () => {
		const events: string[] = []
		const first = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.first',
			setup: () => {
				events.push('setup:first')
			},
			hooks: {
				connect: () => {
					events.push('connect:first')
				},
				stop: () => {
					events.push('stop:first')
				},
				dispose: () => {
					events.push('dispose:first')
				},
			},
		})
		const second = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.second',
			dependencies: ['fixture.first'],
			setup: () => {
				events.push('setup:second')
			},
			hooks: {
				connect: () => {
					events.push('connect:second')
					throw new Error('connection failed')
				},
				stop: () => {
					events.push('stop:second')
				},
				dispose: () => {
					events.push('dispose:second')
				},
			},
		})
		const lifecycle = createLifecycle([first, second])

		await expect(lifecycle.start()).rejects.toThrow('connection failed')
		expect(events).toStrictEqual([
			'setup:first',
			'setup:second',
			'connect:first',
			'connect:second',
			'stop:first',
			'dispose:second',
			'dispose:first',
		])
		expect(lifecycle.state).toBe('disposed')
		await expect(lifecycle.stop()).resolves.toBeUndefined()
	})

	it('disposes completed setup when later setup fails', async () => {
		const events: string[] = []
		const first = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.first',
			setup: () => ({ ready: true }),
			hooks: {
				dispose: () => {
					events.push('dispose:first')
				},
			},
		})
		const second = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.second',
			setup: () => {
				throw new Error('setup failed')
			},
		})
		const lifecycle = createLifecycle([first, second])

		await expect(lifecycle.start()).rejects.toThrow('setup failed')
		expect(events).toStrictEqual(['dispose:first'])
		expect(() => lifecycle.getPluginExports('fixture.first')).toThrow(
			new TypeError('Plugin setup has not completed: fixture.first'),
		)
	})

	it('lets a concurrent stop observe startup cleanup without repeating it', async () => {
		let rejectConnection: ((reason: Error) => void) | undefined
		const connection = new Promise<void>((_resolve, reject) => {
			rejectConnection = reject
		})
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.concurrent',
			hooks: {
				connect: async () => connection,
			},
		})
		const lifecycle = createLifecycle([plugin])
		const start = lifecycle.start()

		// Setup yields once before connect, allowing stop to join the active start.
		await Promise.resolve()
		const stop = lifecycle.stop()

		rejectConnection?.(new Error('connection failed'))
		await expect(start).rejects.toThrow('connection failed')
		await expect(stop).resolves.toBeUndefined()
		expect(lifecycle.state).toBe('disposed')
	})

	it('lets concurrent disposal reuse cleanup performed by failed startup', async () => {
		let rejectConnection: ((reason: Error) => void) | undefined
		const connection = new Promise<void>((_resolve, reject) => {
			rejectConnection = reject
		})
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.concurrent-disposal',
			hooks: {
				connect: async () => connection,
			},
		})
		const lifecycle = createLifecycle([plugin])
		const start = lifecycle.start()

		await Promise.resolve()
		const disposal = lifecycle.dispose()

		rejectConnection?.(new Error('connection failed'))
		await expect(start).rejects.toThrow('connection failed')
		await expect(disposal).rejects.toThrow('connection failed')
		expect(lifecycle.state).toBe('disposed')
	})

	it('waits for standalone setup before disposing its completed work', async () => {
		let completeSetup: (() => void) | undefined
		const setupBarrier = new Promise<void>((resolve) => {
			completeSetup = resolve
		})
		const events: string[] = []
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.concurrent-setup',
			setup: async () => {
				await setupBarrier
				events.push('setup')
			},
			hooks: {
				dispose: () => {
					events.push('dispose')
				},
			},
		})
		const lifecycle = createLifecycle([plugin])
		const setup = lifecycle.setup()
		const disposal = lifecycle.dispose()

		completeSetup?.()
		await setup
		await disposal
		expect(events).toStrictEqual(['setup', 'dispose'])
		expect(lifecycle.state).toBe('disposed')
	})

	it('continues reverse cleanup and reports hook failures', async () => {
		const first = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.first',
			hooks: {
				stop: () => {
					throw new Error('stop failed')
				},
				dispose: () => {
					throw new Error('first dispose failed')
				},
			},
		})
		const second = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.second',
			hooks: {
				dispose: () => {
					throw new Error('second dispose failed')
				},
			},
		})
		const lifecycle = createLifecycle([first, second])

		await lifecycle.start()
		await expect(lifecycle.stop()).rejects.toThrow('stop failed')
		await expect(lifecycle.dispose()).rejects.toEqual(
			expect.objectContaining({
				name: 'AggregateError',
				message: 'Multiple plugin disposal operations failed.',
				errors: [
					expect.objectContaining({ message: 'stop failed' }),
					expect.objectContaining({ message: 'second dispose failed' }),
					expect.objectContaining({ message: 'first dispose failed' }),
				],
			}),
		)
	})

	it('disposes setup-only plugins without invoking stop', async () => {
		const events: string[] = []
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.setup-only',
			hooks: {
				stop: () => {
					events.push('stop')
				},
				dispose: () => {
					events.push('dispose')
				},
			},
		})
		const lifecycle = createLifecycle([plugin])

		await lifecycle.setup()
		await lifecycle.dispose()
		expect(events).toStrictEqual(['dispose'])
	})

	it('allows disposal before setup without creating plugin state', async () => {
		const lifecycle = createLifecycle([])

		await lifecycle.dispose()
		expect(lifecycle.state).toBe('disposed')
	})

	it('aggregates cleanup failures without hiding the startup failure', async () => {
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.unstable',
			hooks: {
				connect: () => {
					throw new Error('start failed')
				},
				dispose: () => {
					throw new Error('dispose failed')
				},
			},
		})
		const lifecycle = createLifecycle([plugin])

		await expect(lifecycle.start()).rejects.toEqual(
			expect.objectContaining({
				name: 'AggregateError',
				message:
					'Plugin lifecycle failed and cleanup reported additional errors.',
				errors: [
					expect.objectContaining({ message: 'start failed' }),
					expect.objectContaining({ message: 'dispose failed' }),
				],
			}),
		)
	})

	it('allows a no-op stop before startup and rejects restart after stop', async () => {
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.plugin',
		})
		const lifecycle = createLifecycle([plugin])

		await lifecycle.stop()
		await lifecycle.start()
		await lifecycle.stop()
		expect(lifecycle.state).toBe('stopped')
		expect(() => lifecycle.start()).toThrow(
			new TypeError('Cannot start a stopped plugin lifecycle'),
		)
		await lifecycle.dispose()
	})
})
