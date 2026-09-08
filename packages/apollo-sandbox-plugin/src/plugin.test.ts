import { describe, expect, it } from 'vitest'

import { apolloSandboxPlugin } from './plugin.js'

describe('apolloSandboxPlugin', () => {
	it('declares its exact route privilege, provider requirement, and asset claim', () => {
		const plugin = apolloSandboxPlugin({ environment: 'development' })

		expect(plugin.manifest).toMatchObject({
			capabilities: {
				provides: [{ contributionId: 'official-apollo-sandbox-browser-route' }],
				requires: [{ phase: 'materialization', version: '^1.0.0' }],
			},
			environment: ['environment:network'],
			identity: { pluginId: '@ultimabase/apollo-sandbox-plugin' },
			privileges: [{ name: 'transport:expose' }],
		})
		expect(plugin.peers).toStrictEqual([
			{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
		])
	})

	it('contributes no capability, privilege, peer, or claim when production disables it', () => {
		const plugin = apolloSandboxPlugin({ environment: 'production' })

		expect(plugin.manifest).toMatchObject({
			capabilities: { provides: [], requires: [] },
			environment: [],
			privileges: [],
		})
		expect(plugin.peers).toBeUndefined()
	})

	it.each([
		[undefined, 'plain object'],
		[{}, 'environment'],
		[{ environment: 'staging' }, 'environment'],
		[{ environment: 'development', allowInProduction: false }, 'must be true'],
		[{ environment: 'development', path: '/' }, 'normalized route suffix'],
		[
			{ environment: 'development', path: '/__ultimabase/apps/example' },
			'normalized route suffix',
		],
		[{ environment: 'development', unknown: true }, 'unknown option'],
	] as const)('rejects invalid options %#', (options, message) => {
		expect(() => apolloSandboxPlugin(options as never)).toThrow(message)
	})
})
