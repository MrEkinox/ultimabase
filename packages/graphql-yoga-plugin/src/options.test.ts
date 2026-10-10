import { describe, expect, it, vi } from 'vitest'

import { graphqlYogaPlugin } from './plugin.js'

describe('graphqlYogaPlugin options', () => {
	it('applies immutable protocol defaults and exact manifest metadata', () => {
		const plugin = graphqlYogaPlugin()
		expect(plugin.manifest).toMatchObject({
			identity: { pluginId: '@ultimabase/graphql-yoga-plugin' },
			privileges: [
				{
					name: 'transport:expose',
					reason: 'Provides the "ultimabase.http.endpoints" capability.',
				},
			],
		})
		expect(plugin.peers).toStrictEqual([
			{ pluginId: '@ultimabase/graphql-plugin', version: '^0.0.0' },
			{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
		])
		expect(plugin.manifest.capabilities).toMatchObject({
			provides: [
				{ contributionId: 'official-graphql-yoga-http-mount' },
				{ contributionId: 'official-graphql-yoga-http-endpoint' },
				// Development default: introspection on (ADR-0312).
				{ contributionId: 'official-graphql-yoga-introspection' },
			],
			requires: [
				{
					phase: 'materialization',
					version: '^1.0.0',
				},
			],
		})
	})

	it('publishes introspection only while it is enabled (ADR-0312)', () => {
		const provided = (plugin: ReturnType<typeof graphqlYogaPlugin>) =>
			plugin.manifest.capabilities.provides.map(
				({ contributionId }) => contributionId,
			)
		expect(provided(graphqlYogaPlugin({ introspection: false }))).not.toContain(
			'official-graphql-yoga-introspection',
		)
		vi.stubEnv('NODE_ENV', 'production')
		expect(provided(graphqlYogaPlugin())).not.toContain(
			'official-graphql-yoga-introspection',
		)
		expect(provided(graphqlYogaPlugin({ introspection: true }))).toContain(
			'official-graphql-yoga-introspection',
		)
		vi.unstubAllEnvs()
	})

	it.each([
		[{ bodyLimit: 0 }, 'positive safe integer'],
		[{ bodyLimit: 1.5 }, 'positive safe integer'],
		[{ introspection: 'yes' } as never, 'boolean'],
		[{ path: 'graphql' }, 'absolute path'],
		[{ path: '/graphql/' }, 'trailing slash'],
		[{ path: '/api//graphql' }, 'empty segments'],
		[{ path: '/api/../graphql' }, 'normalized'],
		[{ path: '/graphql?debug=true' }, 'query or fragment'],
		[{ extra: true } as never, 'unknown option'],
	])('rejects invalid options %#', (options, message) => {
		expect(() => graphqlYogaPlugin(options)).toThrow(message)
	})
})
