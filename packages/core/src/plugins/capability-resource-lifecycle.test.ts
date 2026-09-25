import { describe, expect, it } from 'vitest'
import { applicationFixture } from '../../tests/application-fixture.js'

import { FrameworkApplication } from '../application/framework-application.js'
import {
	defineCapability,
	provideCapability,
	requireCapability,
} from './capabilities.js'
import { definePlugin } from './definition.js'

// Resource cleanup runs under the same exclusive application lifecycle as production.
describe('application capability resources', () => {
	it('materializes application dependencies before setup and disposes after owner hooks', async () => {
		const events: string[] = []
		interface Transport {
			readonly endpoint: string
		}
		const token = defineCapability<Transport>()({
			capabilityId: 'fixture.application-transport',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([provider]) => provider,
		})
		const requirement = requireCapability(token, '^1.0.0')
		const provider = definePlugin({
			pluginId: 'fixture.application-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [
				provideCapability(token, {
					contributionId: 'primary',
					create: ({ schemas }) => {
						events.push(`create:${String(schemas.size)}`)
						void schemas.schemaTargets
						return {
							value: { endpoint: 'local' },
							dispose: () => {
								events.push('resource-dispose')
							},
						}
					},
				}),
			],
			setup: () => {
				events.push('provider-setup')
			},
			hooks: {
				dispose: () => {
					events.push('provider-dispose')
				},
			},
		})
		const consumer = definePlugin({
			pluginId: 'fixture.application-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [requirement],
			setup: ({ capabilities }) => {
				events.push(`consumer-setup:${capabilities.get(requirement).endpoint}`)
			},
			hooks: {
				dispose: () => {
					events.push('consumer-dispose')
				},
			},
		})
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [],
				plugins: [consumer, provider],
				pluginPrivileges: { logger: false },
			}),
		)

		await application.initialize()
		await application.dispose()

		expect(events).toStrictEqual([
			'create:0',
			'provider-setup',
			'consumer-setup:local',
			'consumer-dispose',
			'provider-dispose',
			'resource-dispose',
		])
	})

	it('materializes and disposes each application resource exactly once', async () => {
		let providerCreates = 0
		let providerDisposes = 0
		const observed: number[] = []
		const token = defineCapability<{ readonly sequence: number }>()({
			capabilityId: 'fixture.resource-application',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([provider]) => provider,
		})
		const requirement = requireCapability(token, '^1.0.0')
		const provider = definePlugin({
			pluginId: 'fixture.resource-winner',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [
				provideCapability(token, {
					contributionId: 'winner',
					create: () => {
						providerCreates += 1
						const sequence = providerCreates
						return {
							value: { sequence },
							dispose: () => {
								providerDisposes += 1
							},
						}
					},
				}),
			],
		})
		const consumer = definePlugin({
			pluginId: 'fixture.resource-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [requirement],
			setup: ({ capabilities }) => {
				observed.push(capabilities.get(requirement).sequence)
			},
		})
		const createApplication = () =>
			applicationFixture(
				new FrameworkApplication({
					schemas: [],
					plugins: [consumer, provider],
					pluginPrivileges: { logger: false },
				}),
			)
		const first = createApplication()
		const second = createApplication()

		await first.initialize()
		await first.dispose()
		await second.initialize()
		await second.dispose()

		expect(providerCreates).toBe(2)
		expect(providerDisposes).toBe(2)
		expect(observed).toStrictEqual([1, 2])
	})

	it('cleans materialized resources when plugin setup fails', async () => {
		let disposeCalls = 0
		const token = defineCapability<string>()({
			capabilityId: 'fixture.partial-cleanup',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([provider]) => provider,
		})
		const provider = definePlugin({
			pluginId: 'fixture.partial-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [
				provideCapability(token, {
					contributionId: 'resource',
					create: () => ({
						value: 'ready',
						dispose: () => {
							disposeCalls += 1
						},
					}),
				}),
			],
		})
		const failing = definePlugin({
			pluginId: 'fixture.partial-failure',
			version: '1.0.0',
			core: '^0.0.0',
			setup: () => {
				throw new Error('Setup failure fixture')
			},
		})
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [],
				plugins: [provider, failing],
				pluginPrivileges: { logger: false },
			}),
		)

		await expect(application.initialize()).rejects.toThrow(
			new Error('Setup failure fixture'),
		)
		expect(disposeCalls).toBe(1)
	})
})
