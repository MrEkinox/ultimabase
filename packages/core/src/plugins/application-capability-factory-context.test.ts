import { describe, expect, it } from 'vitest'

import { createApplication } from '../application/framework-application.js'
import { defineCapability, provideCapability } from './capabilities.js'
import { plugin as createPlugin } from './plugin.js'
import { withPluginPrivileges } from './plugin-contributions.js'
import { PluginGraph } from './graph.js'
import { normalizePlugins } from './normalization.js'

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
			createPlugin({
				id: privileged
					? 'fixture.privileged-provider'
					: 'fixture.unprivileged-provider',
				version: '1.0.0',
				core: '^0.0.0',
				...(privileged
					? {
							permissions: {
								'runtime:intercept':
									'Provides the privileged fixture protocol.',
							},
						}
					: {}),
				contributions: [
					provideCapability(token, {
						contributionId: 'fixture',
						value: 'value',
					}),
				],
			})

		expect(() => provider(false)).toThrow(
			'Missing plugin permission reason: runtime:intercept',
		)
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
		const plugin = createPlugin({
			id: 'fixture.factory-context-owner',
			instanceId: 'primary',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: {
				'event:publish': 'Publishes the factory-context fixture event.',
			},
			contributions: [
				withPluginPrivileges(
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
					['event:publish'],
				),
			],
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
