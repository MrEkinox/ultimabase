import { UltimaBase, definePlugin } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import {
	httpMount,
	httpPlugin,
	provideHttpEndpoints,
} from '@ultimabase/http-plugin'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'
import { describe, expect, it } from 'vitest'

import { graphqlYogaPlugin } from './plugin.js'
import { graphqlYogaFixtureDatabasePlugin } from './test-application.test-support.js'

const schema = new GraphQLSchema({
	query: new GraphQLObjectType({
		name: 'Query',
		fields: { value: { resolve: () => 'value', type: GraphQLString } },
	}),
})

describe('GraphQL Yoga plugin graph', () => {
	it('requires explicit GraphQL and HTTP sibling plugins', () => {
		expect(
			() =>
				new UltimaBase({
					pluginPrivileges: { logger: false },
					plugins: [graphqlYogaFixtureDatabasePlugin, graphqlYogaPlugin()],
					schemas: [],
				}),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_DEPENDENCY_MISSING' }))

		expect(
			() =>
				new UltimaBase({
					pluginPrivileges: { logger: false },
					plugins: [
						graphqlYogaFixtureDatabasePlugin,
						graphqlPlugin({ default: false }),
						graphqlYogaPlugin(),
					],
					schemas: [],
				}),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_DEPENDENCY_MISSING' }))
	})

	it('requires the real GraphQL application capability, not an ID lookalike', () => {
		const lookalike = definePlugin({
			core: '^0.0.0',
			pluginId: '@ultimabase/graphql-plugin',
			version: '0.0.0',
		})
		expect(
			() =>
				new UltimaBase({
					pluginPrivileges: { logger: false },
					plugins: [
						graphqlYogaFixtureDatabasePlugin,
						httpPlugin({ appId: 'lookalike' }),
						lookalike,
						graphqlYogaPlugin(),
					],
					schemas: [],
				}),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_MISSING' }))
	})

	it('participates in deterministic HTTP mount collision detection', async () => {
		const collision = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.graphql-yoga-collision',
			version: '1.0.0',
			privileges: [
				{ name: 'transport:expose', reason: 'Creates a collision fixture.' },
			],
			capabilities: {
				provides: [
					provideHttpEndpoints({
						contributionId: 'collision',
						create: () =>
							httpMount({
								handle: () => new Response('collision'),
								path: '/graphql',
								protocol: { name: 'fixture.collision', version: '1' },
							}),
					}),
				],
			},
		})
		const application = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				graphqlYogaFixtureDatabasePlugin,
				httpPlugin({ appId: 'collision' }),
				graphqlPlugin({ default: false, schemas: [schema] }),
				graphqlYogaPlugin(),
				collision,
			],
			schemas: [],
		})
		await expect(application.start()).rejects.toThrow('HTTP endpoint collision')
		await application.dispose()
	})
})
