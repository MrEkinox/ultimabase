import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../../application/framework-application.js'
import { requireCapability } from '../../plugins/capabilities.js'
import { definePlugin } from '../../plugins/definition.js'
import {
	defineAdapterRawCapability,
	provideAdapterRawCapability,
} from './raw-access.js'

interface FixtureRawFacade {
	read(): string
}

const rawCapability = defineAdapterRawCapability<FixtureRawFacade>()({
	capabilityId: 'fixture.database-raw',
	version: '1.0.0',
})

describe('raw adapter setup leases', () => {
	it('rejects malformed raw providers before setup access', async () => {
		const malformed = definePlugin({
			capabilities: [
				provideAdapterRawCapability(rawCapability, {
					contributionId: 'malformed',
					// @ts-expect-error -- Runtime validation protects untyped factories.
					create: () => ({ unknown: true }),
				}),
			],
			core: '^0.0.0',
			pluginId: 'fixture.database-malformed-provider',
			version: '1.0.0',
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [malformed],
			schemas: [],
		})

		await expect(application.initialize()).rejects.toThrow(
			'raw adapter provider contains unknown option',
		)
		await application.dispose()
	})

	it('reports unsupported setup scope and non-object facades', async () => {
		const requirement = requireCapability(rawCapability, '^1.0.0')
		const consumer = definePlugin({
			capabilities: [requirement],
			core: '^0.0.0',
			pluginId: 'fixture.raw-validation-consumer',
			privileges: [
				{ name: 'adapter:raw', reason: 'Validates raw setup failures.' },
			] as const,
			setup: ({ adapters }) => adapters.withRaw(requirement, () => undefined),
			version: '1.0.0',
		})
		const transactionOnly = definePlugin({
			capabilities: [
				provideAdapterRawCapability(rawCapability, {
					contributionId: 'transaction-only',
					create: () => ({
						transaction: () => ({ read: () => 'transaction' }),
					}),
				}),
			],
			core: '^0.0.0',
			pluginId: 'fixture.database-transaction-only',
			version: '1.0.0',
		})
		const unsupported = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [transactionOnly, consumer],
			schemas: [],
		})
		await expect(unsupported.initialize()).rejects.toMatchObject({
			code: 'PLUGIN_ADAPTER_CAPABILITY_MISSING',
		})
		await unsupported.dispose()

		const primitiveProvider = definePlugin({
			capabilities: [
				provideAdapterRawCapability(rawCapability, {
					contributionId: 'primitive',
					create: () => ({
						// @ts-expect-error -- Runtime validation rejects primitive facades.
						setup: () => 'invalid',
					}),
				}),
			],
			core: '^0.0.0',
			pluginId: 'fixture.database-primitive-provider',
			version: '1.0.0',
		})
		const primitive = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [primitiveProvider, consumer],
			schemas: [],
		})
		await expect(primitive.initialize()).rejects.toThrow(
			'raw adapter provider must return an object facade',
		)
		await primitive.dispose()
	})

	it('does not let portable adapter consumption authority resolve raw access', () => {
		const requirement = requireCapability(rawCapability, '^1.0.0')
		const provider = definePlugin({
			capabilities: [
				provideAdapterRawCapability(rawCapability, {
					contributionId: 'raw',
					create: () => ({ setup: () => ({ read: () => 'ready' }) }),
				}),
			],
			core: '^0.0.0',
			pluginId: 'fixture.database-provider-portable',
			version: '1.0.0',
		})
		const consumer = definePlugin({
			capabilities: [requirement],
			core: '^0.0.0',
			pluginId: 'fixture.raw-portable-consumer',
			privileges: [
				{ name: 'adapter:consume', reason: 'Consumes portable behavior only.' },
			] as const,
			version: '1.0.0',
		})

		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [provider, consumer],
					schemas: [],
				}),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_CONFLICT' }))
	})

	it('revokes captured facades when setup returns', async () => {
		const requirement = requireCapability(rawCapability, '^1.0.0')
		let escaped: FixtureRawFacade | undefined
		let observedKeys: readonly PropertyKey[] = []
		const provider = definePlugin({
			capabilities: [
				provideAdapterRawCapability(rawCapability, {
					contributionId: 'raw',
					create: () => ({
						setup: () => ({ read: () => 'ready' }),
					}),
				}),
			],
			core: '^0.0.0',
			pluginId: 'fixture.database-provider',
			version: '1.0.0',
		})
		const consumer = definePlugin({
			capabilities: [requirement],
			core: '^0.0.0',
			pluginId: 'fixture.raw-consumer',
			privileges: [
				{ name: 'adapter:raw', reason: 'Exercises the setup lease.' },
			] as const,
			setup: async ({ adapters }) =>
				adapters.withRaw(requirement, (facade) => {
					escaped = facade
					observedKeys = Reflect.ownKeys(facade)
					return facade.read()
				}),
			version: '1.0.0',
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [provider, consumer],
			schemas: [],
		})

		await application.initialize()
		expect(application.getPlugin('fixture.raw-consumer')).toBe('ready')
		expect(observedKeys).toContain('read')
		expect(() => escaped?.read()).toThrow(
			expect.objectContaining({ code: 'TRANSACTION_ERROR' }),
		)
		await application.dispose()
	})
})
