import { describe, expect, it } from 'vitest'

import { createApplication } from '../application/framework-application.js'
import { FrameworkError } from '../errors/framework-error.js'
import { defineCapability, provideCapability } from './capabilities.js'
import { definePlugin } from './definition.js'
import { PluginGraph } from './graph.js'
import { normalizePlugins } from './normalization.js'

const captureFrameworkErrorDetails = (operation: () => unknown): unknown => {
	try {
		operation()
	} catch (error: unknown) {
		if (error instanceof FrameworkError) return error.internalDetails
		throw error
	}
	throw new TypeError('Expected a FrameworkError')
}

describe('application capability factory context', () => {
	it('enforces token-owned provider privileges before composition', () => {
		const token = defineCapability<string>()({
			capabilityId: 'fixture.privileged-provider',
			version: '1.0.0',
			cardinality: 'multiple',
			lifetime: 'declaration',
			providerPrivilege: 'runtime:intercept',
			compose: (providers) => providers.join(','),
		})
		const provider = (privileged: boolean) =>
			definePlugin({
				pluginId: privileged
					? 'fixture.privileged-provider'
					: 'fixture.unprivileged-provider',
				version: '1.0.0',
				core: '^0.0.0',
				...(privileged
					? {
							privileges: [
								{
									name: 'runtime:intercept' as const,
									reason: 'Provides the privileged fixture protocol.',
								},
							],
						}
					: {}),
				capabilities: {
					provides: [
						provideCapability(token, {
							contributionId: 'fixture',
							value: 'value',
						}),
					],
				},
			})

		expect(
			captureFrameworkErrorDetails(
				() => new PluginGraph(normalizePlugins([provider(false)])),
			),
		).toMatchObject({
			kind: 'capability-privilege-missing',
			privilege: 'runtime:intercept',
		})
		expect(
			() => new PluginGraph(normalizePlugins([provider(true)])),
		).not.toThrow()
	})

	it('binds exact owner identity and active privilege assertions', async () => {
		const token = defineCapability<string>()({
			capabilityId: 'fixture.factory-context',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([provider]) => provider,
		})
		let observedOwner: unknown
		let denied: unknown
		const plugin = definePlugin({
			pluginId: 'fixture.factory-context-owner',
			instanceId: 'primary',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{
					name: 'event:publish',
					reason: 'Publishes the factory-context fixture event.',
				},
			],
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'factory-context',
						create: ({ assertPrivilege, owner }) => {
							observedOwner = owner
							assertPrivilege('event:publish')
							try {
								assertPrivilege('adapter:raw')
							} catch (error: unknown) {
								denied = error
							}
							return { value: 'ready' }
						},
					}),
				],
			},
		})

		const application = await createApplication({
			plugins: [plugin],
			schemas: [],
		})

		expect(observedOwner).toStrictEqual({
			instanceId: 'primary',
			pluginId: 'fixture.factory-context-owner',
		})
		expect(denied).toMatchObject({ code: 'PLUGIN_PRIVILEGE_DENIED' })
		await application.dispose()
	})
})
