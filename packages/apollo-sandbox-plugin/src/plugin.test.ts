import { afterEach, describe, expect, it, vi } from 'vitest'

import { apolloSandboxPlugin } from './plugin.js'

describe('apolloSandboxPlugin', () => {
	it('declares its exact route privilege, provider requirement, and asset claim', () => {
		const plugin = apolloSandboxPlugin({ environment: 'development' })

		expect(plugin.manifest).toMatchObject({
			capabilities: {
				provides: [{ contributionId: 'official-apollo-sandbox-browser-route' }],
				requires: [
					{ phase: 'materialization', version: '^1.0.0' },
					// A served explorer requires introspection (ADR-0312).
					{ phase: 'materialization', version: '^1.0.0' },
				],
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
		[null, 'plain object'],
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

	// ADR-0312: environment is optional and derived from NODE_ENV.
	describe('derived environment', () => {
		const served = (plugin: ReturnType<typeof apolloSandboxPlugin>) =>
			plugin.manifest.capabilities.provides.length > 0

		afterEach(() => {
			vi.unstubAllEnvs()
		})

		it.each([
			['production', false],
			['development', true],
			['test', true],
			[undefined, true],
		])('serves the route from NODE_ENV %j: %s', (environment, expected) => {
			vi.stubEnv('NODE_ENV', environment)
			expect(served(apolloSandboxPlugin())).toBe(expected)
		})

		it('serves production only with allowInProduction and lets environment win', () => {
			vi.stubEnv('NODE_ENV', 'production')
			expect(served(apolloSandboxPlugin({ allowInProduction: true }))).toBe(
				true,
			)
			expect(served(apolloSandboxPlugin({ environment: 'development' }))).toBe(
				true,
			)
			vi.stubEnv('NODE_ENV', 'development')
			expect(served(apolloSandboxPlugin({ environment: 'production' }))).toBe(
				false,
			)
		})

		it('reads NODE_ENV when the plugin is created', () => {
			vi.stubEnv('NODE_ENV', 'production')
			const plugin = apolloSandboxPlugin()
			vi.stubEnv('NODE_ENV', 'development')
			expect(served(plugin)).toBe(false)
		})
	})
})
