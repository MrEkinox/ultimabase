import {
	Schema,
	UltimaBase,
	plugin,
	RequestContext,
	type PluginIdentity,
} from '@ultimabase/core'
import {
	GraphQLDirective,
	GraphQLInt,
	GraphQLObjectType,
	GraphQLScalarType,
	GraphQLSchema,
	GraphQLString,
	DirectiveLocation,
	graphql as executeGraphql,
} from 'graphql'
import { describe, expect, it } from 'vitest'

import { graphqlPlugin } from './plugin.js'
import type { GraphqlApplication } from './application.js'
import { composeGraphqlSchemas } from './schema-composition.js'
import { provideGraphqlSchemas } from './schema-contributions.js'
import { graphqlFixtureDatabasePlugin } from './test-application.test-support.js'

const Hidden = Schema.define({
	className: 'CompositionHidden',
	fields: (field) => ({ value: field.string() }),
})

const schemaWithQuery = (
	name: string,
	value: string,
	extraTypes: readonly GraphQLObjectType[] = [],
): GraphQLSchema =>
	new GraphQLSchema({
		query: new GraphQLObjectType({
			name: 'Query',
			fields: { [name]: { type: GraphQLString, resolve: () => value } },
		}),
		types: extraTypes,
	})

const schemaProvider = (
	identity: PluginIdentity,
	field: string,
	value: string,
) =>
	plugin({
		core: '^0.0.0',
		id: identity.pluginId,
		...(identity.instanceId === undefined
			? {}
			: { instanceId: identity.instanceId }),
		version: '1.0.0',
		permissions: { 'transport:expose': 'Adds a public GraphQL fixture.' },
		contributions: [
			provideGraphqlSchemas({
				contributionId: `schema-${field}`,
				create: () => schemaWithQuery(field, value),
			}),
		],
	})

describe('GraphQL schema composition', () => {
	it('runs application and plugin resolvers under their exact attribution', async () => {
		const trace: string[] = []
		const applicationSchema = schemaWithQuery('applicationOwner', 'application')
		const pluginSchema = schemaWithQuery('pluginOwner', 'plugin')
		const schema = composeGraphqlSchemas({
			callbacks: {
				runApplication: (callback) => {
					trace.push('application')
					return callback()
				},
				runPlugin: (owner, callback) => {
					trace.push(`${owner.pluginId}#${owner.instanceId ?? ''}`)
					return callback()
				},
			},
			schemas: [
				{
					attribution: { kind: 'application' },
					description: 'application schema',
					schema: applicationSchema,
				},
				{
					attribution: {
						kind: 'plugin',
						owner: {
							pluginId: 'fixture.attributed-schema',
							instanceId: 'primary',
						},
						pluginVersion: '1.0.0',
					},
					description: 'plugin schema',
					schema: pluginSchema,
				},
			],
		})
		const request = RequestContext.anonymous({
			requestId: 'attribution',
			source: 'test',
		})
		const result = await executeGraphql({
			contextValue: { request },
			schema,
			source: '{ applicationOwner pluginOwner }',
		})

		expect(result.errors).toBeUndefined()
		expect(trace).toStrictEqual([
			'application',
			'fixture.attributed-schema#primary',
		])
	})

	it('clones and extends generated types with application-owned schemas', async () => {
		const Post = Schema.define({
			className: 'CompositionPost',
			fields: (field) => ({ title: field.string() }),
		})
		const extension = new GraphQLObjectType({
			name: 'CompositionPost',
			fields: {
				summary: {
					type: GraphQLString,
					resolve: (source) =>
						typeof source === 'object' && source !== null
							? String(Reflect.get(source, 'title')).toUpperCase()
							: null,
				},
			},
		})
		const custom = schemaWithQuery('health', 'ok', [extension])
		const originalHealth = custom.getQueryType()?.getFields().health
		const application = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				graphqlPlugin({
					acknowledgeUnverifiedProtection: true,
					schemas: [custom],
				}),
				graphqlFixtureDatabasePlugin,
			],
			schemas: [Post],
		})
		await application.start()
		const graphql = application.plugin(
			'@ultimabase/graphql-plugin',
		) as GraphqlApplication

		expect(
			Object.keys(
				(
					graphql.schema.getType('CompositionPost') as GraphQLObjectType
				).getFields(),
			),
		).toEqual(expect.arrayContaining(['id', 'summary', 'title']))
		if (originalHealth !== undefined) originalHealth.resolve = () => 'mutated'
		const result = await graphql.execute({
			context: application.anonymous({
				requestId: 'composition-clone',
				source: 'test',
			}).context,
			document: '{ health }',
		})
		expect(result).toEqual({ data: { health: 'ok' } })
		await application.dispose()
	})

	it('orders exact plugin-instance contributions after application schemas', async () => {
		const first = schemaProvider(
			{ pluginId: 'fixture.graphql-schema-provider', instanceId: 'first' },
			'first',
			'one',
		)
		const second = schemaProvider(
			{ pluginId: 'fixture.graphql-schema-provider', instanceId: 'second' },
			'second',
			'two',
		)
		const application = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				first,
				second,
				graphqlPlugin({
					acknowledgeUnverifiedProtection: true,
					default: false,
					schemas: [schemaWithQuery('application', 'direct')],
				}),
				graphqlFixtureDatabasePlugin,
			],
			schemas: [Hidden],
		})
		await application.start()
		const graphql = application.plugin(
			'@ultimabase/graphql-plugin',
		) as GraphqlApplication
		expect(
			Object.keys(graphql.schema.getQueryType()?.getFields() ?? {}),
		).toEqual(['application', 'first', 'second'])
		const result = await graphql.execute({
			context: application.anonymous({
				requestId: 'composition-order',
				source: 'test',
			}).context,
			document: '{ application first second }',
		})
		expect(result).toEqual({
			data: { application: 'direct', first: 'one', second: 'two' },
		})
		await application.dispose()
	})

	it.each([
		[
			schemaWithQuery('duplicate', 'first'),
			schemaWithQuery('duplicate', 'second'),
			'object field',
		],
		[
			new GraphQLSchema({
				query: new GraphQLObjectType({
					name: 'Query',
					fields: { ok: { type: GraphQLString } },
				}),
				types: [
					new GraphQLScalarType({ name: 'OwnedScalar', serialize: String }),
				],
			}),
			new GraphQLSchema({
				query: new GraphQLObjectType({
					name: 'Query',
					fields: { other: { type: GraphQLString } },
				}),
				types: [
					new GraphQLScalarType({ name: 'OwnedScalar', serialize: String }),
				],
			}),
			'scalar',
		],
		[
			new GraphQLSchema({
				query: new GraphQLObjectType({
					name: 'Query',
					fields: { ok: { type: GraphQLString } },
				}),
				directives: [
					new GraphQLDirective({
						name: 'owned',
						locations: [DirectiveLocation.FIELD],
					}),
				],
			}),
			new GraphQLSchema({
				query: new GraphQLObjectType({
					name: 'Query',
					fields: { other: { type: GraphQLInt } },
				}),
				directives: [
					new GraphQLDirective({
						name: 'owned',
						locations: [DirectiveLocation.FIELD],
					}),
				],
			}),
			'directive',
		],
	] as const)(
		'rejects deterministic %s conflicts',
		async (left, right, label) => {
			await expect(
				new UltimaBase({
					pluginPrivileges: { logger: false },
					plugins: [
						graphqlPlugin({
							acknowledgeUnverifiedProtection: true,
							default: false,
							schemas: [left, right],
						}),
						graphqlFixtureDatabasePlugin,
					],
					schemas: [Hidden],
				}).start(),
			).rejects.toThrow(label)
		},
	)

	it('enforces transport privilege on every schema provider', () => {
		expect(() =>
			plugin({
				core: '^0.0.0',
				id: 'fixture.denied-graphql-provider',
				version: '1.0.0',
				contributions: [
					provideGraphqlSchemas({
						contributionId: 'denied',
						create: () => schemaWithQuery('denied', 'no'),
					}),
				],
			}),
		).toThrow('Missing plugin permission reason: transport:expose')
	})

	it('rejects subscription roots outside the v1 contract', async () => {
		const schema = new GraphQLSchema({
			query: new GraphQLObjectType({
				name: 'Query',
				fields: { health: { type: GraphQLString } },
			}),
			subscription: new GraphQLObjectType({
				name: 'Subscription',
				fields: { events: { type: GraphQLString } },
			}),
		})

		await expect(
			new UltimaBase({
				pluginPrivileges: { logger: false },
				plugins: [
					graphqlPlugin({ schemas: [schema] }),
					graphqlFixtureDatabasePlugin,
				],
				schemas: [Hidden],
			}).start(),
		).rejects.toThrow('subscriptions')
	})
})
