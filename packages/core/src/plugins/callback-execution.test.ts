import { describe, expect, it } from 'vitest'

import { createApplication } from '../application/framework-application.js'
import { defineCapability, provideCapability } from './capabilities.js'
import type { ApplicationCallbackExecutor } from './callback-execution.js'
import { plugin } from './plugin.js'
import { readApplicationPluginOwner } from './callback-execution.js'

const callbackExecutorCapability = defineCapability<true>()({
	capabilityId: 'fixture.callback-executor',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
})

describe('application callback execution attribution', () => {
	it('replaces nested owners, retains async scope, and restores the parent owner', async () => {
		let callbacks: ApplicationCallbackExecutor | undefined
		const host = plugin({
			core: '^0.0.0',
			id: 'fixture.callback-host',
			version: '0.0.0',
			contributions: [
				provideCapability(callbackExecutorCapability, {
					contributionId: 'capture-executor',
					create: (context) => {
						callbacks = context.callbacks
						return { value: true as const }
					},
				}),
			],
		})
		const worker = plugin({
			core: '^0.0.0',
			instanceId: 'worker',
			id: 'fixture.callback-worker',
			version: '0.0.0',
			contributions: [],
		})
		const application = await createApplication({
			logger: false,
			plugins: [host, worker],
			schemas: [],
		})

		if (callbacks === undefined) {
			throw new TypeError('Fixture callback executor was not materialized')
		}
		const executor = callbacks
		const workerIdentity = {
			instanceId: 'worker',
			pluginId: 'fixture.callback-worker',
		} as const
		const observations: unknown[] = []

		await executor.runPlugin(workerIdentity, async () => {
			observations.push(readApplicationPluginOwner(application))
			await Promise.resolve()
			observations.push(readApplicationPluginOwner(application))
			executor.runApplication(() => {
				observations.push(readApplicationPluginOwner(application))
			})
			observations.push(readApplicationPluginOwner(application))
		})
		observations.push(readApplicationPluginOwner(application))

		expect(observations).toStrictEqual([
			workerIdentity,
			workerIdentity,
			undefined,
			workerIdentity,
			undefined,
		])
		await application.dispose()
	})

	it('rejects an unknown exact instance before its callback begins', async () => {
		let callbacks: ApplicationCallbackExecutor | undefined
		const host = plugin({
			core: '^0.0.0',
			id: 'fixture.callback-owner-validation',
			version: '0.0.0',
			contributions: [
				provideCapability(callbackExecutorCapability, {
					contributionId: 'capture-executor',
					create: (context) => {
						callbacks = context.callbacks
						return { value: true as const }
					},
				}),
			],
		})
		const application = await createApplication({
			logger: false,
			plugins: [host],
			schemas: [],
		})

		if (callbacks === undefined) {
			throw new TypeError('Fixture callback executor was not materialized')
		}
		const executor = callbacks
		let invoked = false
		expect(() => {
			executor.runPlugin(
				{
					instanceId: 'missing',
					pluginId: 'fixture.callback-owner-validation',
				},
				() => {
					invoked = true
				},
			)
		}).toThrow(
			expect.objectContaining({
				code: 'PLUGIN_CONFLICT',
				internalDetails: {
					kind: 'callback-owner-unknown',
					plugin: 'fixture.callback-owner-validation (instance missing)',
				},
			}),
		)
		expect(invoked).toBe(false)
		await application.dispose()
	})
})
