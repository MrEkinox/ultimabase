import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../../application/framework-application.js'
import { requireCapability } from '../../plugins/capabilities.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import { contributeApplication } from '../../plugins/plugin-contributions.js'
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
		const malformed = createPlugin({
			core: '^0.0.0',
			id: 'fixture.database-malformed-provider',
			version: '1.0.0',
			contributions: [
				provideAdapterRawCapability(rawCapability, {
					contributionId: 'malformed',
					// @ts-expect-error -- Runtime validation protects untyped factories.
					create: () => ({ unknown: true }),
				}),
			],
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
		const consumer = createPlugin({
			core: '^0.0.0',
			id: 'fixture.raw-validation-consumer',
			permissions: { 'adapter:raw': 'Validates raw setup failures.' },
			version: '1.0.0',
			contributions: [
				requirement,
				contributeApplication(async ({ adapters }) => {
					await adapters.withRaw(requirement, () => Promise.resolve())
					return { exports: undefined }
				}),
			],
		})
		const transactionOnly = createPlugin({
			core: '^0.0.0',
			id: 'fixture.database-transaction-only',
			version: '1.0.0',
			contributions: [
				provideAdapterRawCapability(rawCapability, {
					contributionId: 'transaction-only',
					create: () => ({
						transaction: () => ({ read: () => 'transaction' }),
					}),
				}),
			],
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

		const primitiveProvider = createPlugin({
			core: '^0.0.0',
			id: 'fixture.database-primitive-provider',
			version: '1.0.0',
			contributions: [
				provideAdapterRawCapability(rawCapability, {
					contributionId: 'primitive',
					create: () => ({
						// @ts-expect-error -- Runtime validation rejects primitive facades.
						setup: () => 'invalid',
					}),
				}),
			],
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
		const provider = createPlugin({
			core: '^0.0.0',
			id: 'fixture.database-provider-portable',
			version: '1.0.0',
			contributions: [
				provideAdapterRawCapability(rawCapability, {
					contributionId: 'raw',
					create: () => ({ setup: () => ({ read: () => 'ready' }) }),
				}),
			],
		})
		expect(() =>
			createPlugin({
				core: '^0.0.0',
				id: 'fixture.raw-portable-consumer',
				permissions: { 'adapter:consume': 'Consumes portable behavior only.' },
				version: '1.0.0',
				contributions: [requirement],
			}),
		).toThrow('Unused plugin permission reason: adapter:consume')
		void provider
	})

	it('revokes captured facades when setup returns', async () => {
		const requirement = requireCapability(rawCapability, '^1.0.0')
		let escaped: FixtureRawFacade | undefined
		let observedKeys: readonly PropertyKey[] = []
		const provider = createPlugin({
			core: '^0.0.0',
			id: 'fixture.database-provider',
			version: '1.0.0',
			contributions: [
				provideAdapterRawCapability(rawCapability, {
					contributionId: 'raw',
					create: () => ({
						setup: () => ({ read: () => 'ready' }),
					}),
				}),
			],
		})
		const consumer = createPlugin({
			core: '^0.0.0',
			id: 'fixture.raw-consumer',
			permissions: { 'adapter:raw': 'Exercises the setup lease.' },
			version: '1.0.0',
			contributions: [
				requirement,
				contributeApplication(async ({ adapters }) => ({
					exports: await adapters.withRaw(requirement, (facade) => {
						escaped = facade
						observedKeys = Reflect.ownKeys(facade)
						return facade.read()
					}),
				})),
			],
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
