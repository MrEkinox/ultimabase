import { describe, expect, it } from 'vitest'

import { graphqlYogaPlugin } from './plugin.js'

describe('graphqlYogaPlugin options', () => {
	it('applies immutable protocol defaults and exact manifest metadata', () => {
		const plugin = graphqlYogaPlugin()
		expect(plugin.manifest).toMatchObject({
			identity: { pluginId: '@ultimabase/graphql-yoga-plugin' },
			privileges: [
				{
					name: 'transport:expose',
					reason: 'Mounts the selected application GraphQL schema over HTTP.',
				},
			],
		})
		expect(plugin.peers).toStrictEqual([
			{ pluginId: '@ultimabase/graphql-plugin', version: '^0.0.0' },
			{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
		])
		expect(plugin.manifest.capabilities).toMatchObject({
			provides: [{ contributionId: 'official-graphql-yoga-http-mount' }],
			requires: [
				{
					phase: 'materialization',
					version: '^1.0.0',
				},
			],
		})
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
