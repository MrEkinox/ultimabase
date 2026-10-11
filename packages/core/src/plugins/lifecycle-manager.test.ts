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

describe('PluginLifecycleManager', () => {
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

	it('runs every phase in dependency order and teardown in reverse order', async () => {
		const events: string[] = []
		const dependency = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.dependency',
			contributions: [
				contributeApplication((context) => {
					events.push('setup:dependency')
					const exports = { name: 'dependency' }
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						connect: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								events.push(`connect:${pluginExports.name}`)
							})(lifecycleContext)
						},
						prepareSchema: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								events.push(`prepareSchema:${pluginExports.name}`)
							})(lifecycleContext)
						},
						startRuntime: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								events.push(`startRuntime:${pluginExports.name}`)
							})(lifecycleContext)
						},
						startTransports: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								events.push(`startTransports:${pluginExports.name}`)
							})(lifecycleContext)
						},
						stop: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								events.push(`stop:${pluginExports.name}`)
							})(lifecycleContext)
						},
						dispose: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								events.push(`dispose:${pluginExports.name}`)
							})(lifecycleContext)
						},
					}
				}),
			],
		})
		const consumer = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.consumer',
			dependencies: [{ pluginId: 'fixture.dependency', version: '^0.0.0' }],
			contributions: [
				contributeApplication(async (context) => {
					await Promise.resolve()
					events.push('setup:consumer')
					const exports = { name: 'consumer' }
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						connect: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								events.push(`connect:${pluginExports.name}`)
							})(lifecycleContext)
						},
						prepareSchema: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								events.push(`prepareSchema:${pluginExports.name}`)
							})(lifecycleContext)
						},
						startRuntime: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								events.push(`startRuntime:${pluginExports.name}`)
							})(lifecycleContext)
						},
						startTransports: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								events.push(`startTransports:${pluginExports.name}`)
							})(lifecycleContext)
						},
						stop: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								events.push(`stop:${pluginExports.name}`)
							})(lifecycleContext)
						},
						dispose: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								events.push(`dispose:${pluginExports.name}`)
							})(lifecycleContext)
						},
					}
				}),
			],
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
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.server',
			contributions: [
				contributeApplication((context) => {
					calls.setup += 1
					const exports = exportedValue
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						connect: () => {
							;(({ pluginExports }: typeof lifecycleContext) => {
								expect(pluginExports).toBe(exportedValue)
								calls.connect += 1
							})(lifecycleContext)
						},
						stop: () => {
							;(() => {
								calls.stop += 1
							})()
						},
						dispose: () => {
							;(() => {
								calls.dispose += 1
							})()
						},
					}
				}),
			],
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
		const first = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.first',
			contributions: [
				contributeApplication((context) => {
					events.push('setup:first')
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						connect: () => {
							;(() => {
								events.push('connect:first')
							})()
						},
						stop: () => {
							;(() => {
								events.push('stop:first')
							})()
						},
						dispose: () => {
							;(() => {
								events.push('dispose:first')
							})()
						},
					}
				}),
			],
		})
		const second = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.second',
			dependencies: [{ pluginId: 'fixture.first', version: '^0.0.0' }],
			contributions: [
				contributeApplication((context) => {
					events.push('setup:second')
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						connect: () =>
							(() => {
								events.push('connect:second')
								throw new Error('connection failed')
							})(),
						stop: () => {
							;(() => {
								events.push('stop:second')
							})()
						},
						dispose: () => {
							;(() => {
								events.push('dispose:second')
							})()
						},
					}
				}),
			],
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
		const first = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.first',
			contributions: [
				contributeApplication((context) => {
					const exports = { ready: true }
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						dispose: () => {
							;(() => {
								events.push('dispose:first')
							})()
						},
					}
				}),
			],
		})
		const second = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.second',
			contributions: [
				contributeApplication(() => {
					throw new Error('setup failed')
				}),
			],
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
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.concurrent',
			contributions: [
				contributeApplication((context) => {
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return { exports, connect: () => (async () => connection)() }
				}),
			],
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
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.concurrent-disposal',
			contributions: [
				contributeApplication((context) => {
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return { exports, connect: () => (async () => connection)() }
				}),
			],
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
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.concurrent-setup',
			contributions: [
				contributeApplication(async (context) => {
					await setupBarrier
					events.push('setup')
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						dispose: () => {
							;(() => {
								events.push('dispose')
							})()
						},
					}
				}),
			],
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
		const first = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.first',
			contributions: [
				contributeApplication((context) => {
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						stop: () =>
							(() => {
								throw new Error('stop failed')
							})(),
						dispose: () =>
							(() => {
								throw new Error('first dispose failed')
							})(),
					}
				}),
			],
		})
		const second = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.second',
			contributions: [
				contributeApplication((context) => {
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						dispose: () =>
							(() => {
								throw new Error('second dispose failed')
							})(),
					}
				}),
			],
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
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.setup-only',
			contributions: [
				contributeApplication((context) => {
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						stop: () => {
							;(() => {
								events.push('stop')
							})()
						},
						dispose: () => {
							;(() => {
								events.push('dispose')
							})()
						},
					}
				}),
			],
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
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.unstable',
			contributions: [
				contributeApplication((context) => {
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						connect: () =>
							(() => {
								throw new Error('start failed')
							})(),
						dispose: () =>
							(() => {
								throw new Error('dispose failed')
							})(),
					}
				}),
			],
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
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.plugin',
			contributions: [],
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
