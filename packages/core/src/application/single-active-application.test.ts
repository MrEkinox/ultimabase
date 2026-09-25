import { describe, expect, it } from 'vitest'

import { definePlugin } from '../plugins/definition.js'
import { defineCapability, provideCapability } from '../plugins/capabilities.js'
import { FrameworkEngine } from '../runtime/engine/framework-engine.js'
import { RuntimePipeline } from '../runtime/pipeline/runtime-pipeline.js'
import { runWithRequestEngine } from '../runtime/context/active-framework-context.js'
import {
	createApplication,
	FrameworkApplication,
} from './framework-application.js'

const activeError = 'Another UltimaBase application is active'
const createEmpty = () => new FrameworkApplication({ schemas: [], plugins: [] })

/** Scope-only tests deliberately have no persistence behavior. */
const createEngine = (
	application: FrameworkApplication<readonly [], readonly []>,
) =>
	new FrameworkEngine({
		application,
		pipeline: new RuntimePipeline({
			normalization: ({ operation }) => operation,
			structuralValidation: ({ operation }) => operation,
			finalMutationValidation: ({ operation }) => operation,
			databaseOperation: {
				execute: () => Promise.reject(new Error('Unexpected persistence')),
			},
			commit: () => undefined,
		}),
	})

describe('single active application ownership', () => {
	it('allows inert compilation but claims before application resource factories', async () => {
		const entered = Promise.withResolvers<undefined>()
		const resume = Promise.withResolvers<undefined>()
		let resources = 0
		let disposals = 0
		const token = defineCapability<string>()({
			capabilityId: 'fixture.activation-resource',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([value]) => value,
		})
		const plugin = definePlugin({
			pluginId: 'fixture.activation',
			version: '0.0.0',
			core: '^0.0.0',
			capabilities: [
				provideCapability(token, {
					contributionId: 'resource',
					create: async () => {
						resources += 1
						entered.resolve(undefined)
						await resume.promise
						return {
							value: 'ready',
							dispose: () => {
								disposals += 1
							},
						}
					},
				}),
			],
		})
		const first = new FrameworkApplication({ schemas: [], plugins: [plugin] })
		const second = new FrameworkApplication({ schemas: [], plugins: [plugin] })
		first.compileSchemas()
		second.compileSchemas()
		const initializing = first.initialize()
		expect(first.initialize()).toBe(initializing)
		await entered.promise
		try {
			await expect(second.initialize()).rejects.toThrow(activeError)
			await expect(
				createApplication({ schemas: [], plugins: [] }),
			).rejects.toThrow(activeError)
			expect(resources).toBe(1)
			await second.dispose()
			const disposing = first.dispose()
			expect(first.dispose()).toBe(disposing)
			await expect(createEmpty().initialize()).rejects.toThrow(activeError)
			resume.resolve(undefined)
			await initializing
			await disposing
			expect(first.state).toBe('disposed')
			expect(disposals).toBe(1)
		} finally {
			resume.resolve(undefined)
			await first.dispose()
		}
		const replacement = createEmpty()
		try {
			await replacement.initialize()
			await first.dispose()
			await second.dispose()
			await expect(createEmpty().initialize()).rejects.toThrow(activeError)
		} finally {
			await replacement.dispose()
		}
	})

	it('keeps the slot after stop and rejects inert or stale low-level engines', async () => {
		const first = createEmpty()
		expect(() => createEngine(first)).toThrow('initialized active application')
		await first.stop()
		await first.start()
		const request = createEngine(first).anonymous({
			requestId: 'first',
			source: 'fixture',
		})
		await first.stop()
		await expect(first.start()).rejects.toThrow('closed application')
		await expect(createEmpty().initialize()).rejects.toThrow(activeError)
		expect(() => runWithRequestEngine(request, () => true)).toThrow(
			'initialized active application',
		)
		await first.dispose()
		const second = createEmpty()
		try {
			await second.initialize()
			expect(() => runWithRequestEngine(request, () => true)).toThrow(
				'initialized active application',
			)
		} finally {
			await second.dispose()
		}
	})

	it('waits for admitted callbacks and their nested work while rejecting new requests', async () => {
		const first = createEmpty()
		await first.start()
		const engine = createEngine(first)
		const request = engine.anonymous({ requestId: 'drain', source: 'fixture' })
		const resume = Promise.withResolvers<undefined>()
		let finished = false
		const work = runWithRequestEngine(request, async () => {
			await resume.promise
			// Even repeated teardown must reject self-waiting while outside disposal drains us.
			expect(() => first.dispose()).toThrow(
				'outside its active request callback',
			)
			expect(() => first.stop()).toThrow('outside its active request callback')
			return runWithRequestEngine(request, () => {
				finished = true
				return 42
			})
		})
		const disposing = first.dispose()
		try {
			await expect(createEmpty().initialize()).rejects.toThrow(activeError)
			expect(() =>
				engine.anonymous({ requestId: 'late', source: 'fixture' }),
			).toThrow('initialized active application')
			expect(finished).toBe(false)
			resume.resolve(undefined)
			expect(await work).toBe(42)
			await disposing
			expect(finished).toBe(true)
		} finally {
			resume.resolve(undefined)
			await disposing
		}
	})

	it('cleans a failed startup and never reruns it after replacement', async () => {
		const failure = new Error('startup failed')
		let cleaned = 0
		const failed = new FrameworkApplication({
			schemas: [],
			plugins: [
				definePlugin({
					pluginId: 'fixture.failed-start',
					version: '0.0.0',
					core: '^0.0.0',
					hooks: {
						connect: () => {
							throw failure
						},
						dispose: () => {
							cleaned += 1
						},
					},
				}),
			],
		})
		await expect(failed.start()).rejects.toBe(failure)
		expect(cleaned).toBe(1)
		const replacement = createEmpty()
		try {
			await replacement.initialize()
			await failed.dispose()
			await expect(failed.start()).rejects.toBe(failure)
			await expect(createEmpty().initialize()).rejects.toThrow(activeError)
		} finally {
			await replacement.dispose()
		}
	})

	it('serializes start, stop, and dispose without late resurrection', async () => {
		const entered = Promise.withResolvers<undefined>()
		const resume = Promise.withResolvers<undefined>()
		const events: string[] = []
		const app = new FrameworkApplication({
			schemas: [],
			plugins: [
				definePlugin({
					pluginId: 'fixture.overlap',
					version: '0.0.0',
					core: '^0.0.0',
					hooks: {
						connect: async () => {
							entered.resolve(undefined)
							await resume.promise
							events.push('connect')
						},
						stop: () => {
							events.push('stop')
						},
						dispose: () => {
							events.push('dispose')
						},
					},
				}),
			],
		})
		const starting = app.start()
		expect(app.start()).toBe(starting)
		await entered.promise
		const stopping = app.stop()
		const disposing = app.dispose()
		resume.resolve(undefined)
		await Promise.all([starting, stopping, disposing])
		expect(events).toEqual(['connect', 'stop', 'dispose'])
		expect(app.state).toBe('disposed')
		const next = createEmpty()
		await next.initialize()
		await next.dispose()
	})
})
