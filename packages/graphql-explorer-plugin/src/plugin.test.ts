import type { PluginDefinition } from '@ultimabase/core/plugin'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { graphqlExplorerPlugin } from './plugin.js'

describe('graphqlExplorerPlugin', () => {
	it.each([undefined, 'graphiql', 'apollo-sandbox'] as const)(
		'declares its route privilege, provider requirements and asset claim (%s)',
		(ui) => {
			const plugin = graphqlExplorerPlugin({
				environment: 'development',
				...(ui === undefined ? {} : { ui }),
			})

			expect(plugin.manifest).toMatchObject({
				capabilities: {
					provides: [
						{ contributionId: 'official-graphql-explorer-browser-route' },
					],
					requires: [
						{ phase: 'materialization', version: '^1.0.0' },
						// A served explorer requires introspection (ADR-0312).
						{ phase: 'materialization', version: '^1.0.0' },
					],
				},
				environment: ['environment:network'],
				identity: { pluginId: '@ultimabase/graphql-explorer-plugin' },
				privileges: [{ name: 'transport:expose' }],
			})
			expect(plugin.peers).toStrictEqual([
				{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
			])
		},
	)

	it('contributes no capability, privilege, peer, or claim when production disables it', () => {
		const plugin = graphqlExplorerPlugin({ environment: 'production' })

		expect(plugin.manifest).toMatchObject({
			capabilities: { provides: [], requires: [] },
			environment: [],
			privileges: [],
		})
		expect(plugin.peers).toBeUndefined()
	})

	it.each([
		[null, 'plain object'],
		[{ ui: 'altair' }, 'ui must be graphiql or apollo-sandbox'],
		[{ environment: 'staging' }, 'environment'],
		[{ environment: 'development', allowInProduction: false }, 'must be true'],
		[{ environment: 'development', path: '/' }, 'normalized route suffix'],
		[
			{ environment: 'development', path: '/__ultimabase/apps/example' },
			'normalized route suffix',
		],
		[{ environment: 'development', unknown: true }, 'unknown option'],
	] as const)('rejects invalid options %#', (options, message) => {
		expect(() => graphqlExplorerPlugin(options as never)).toThrow(message)
	})

	// ADR-0312: environment is optional and derived from NODE_ENV.
	describe('derived environment', () => {
		const served = (plugin: PluginDefinition) =>
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
			expect(served(graphqlExplorerPlugin())).toBe(expected)
			expect(served(graphqlExplorerPlugin({ ui: 'apollo-sandbox' }))).toBe(
				expected,
			)
		})

		it('serves production only with allowInProduction and lets environment win', () => {
			vi.stubEnv('NODE_ENV', 'production')
			expect(served(graphqlExplorerPlugin({ allowInProduction: true }))).toBe(
				true,
			)
			expect(
				served(graphqlExplorerPlugin({ environment: 'development' })),
			).toBe(true)
			vi.stubEnv('NODE_ENV', 'development')
			expect(served(graphqlExplorerPlugin({ environment: 'production' }))).toBe(
				false,
			)
		})

		it('reads NODE_ENV when the plugin is created', () => {
			vi.stubEnv('NODE_ENV', 'production')
			const plugin = graphqlExplorerPlugin()
			vi.stubEnv('NODE_ENV', 'development')
			expect(served(plugin)).toBe(false)
		})
	})
})
