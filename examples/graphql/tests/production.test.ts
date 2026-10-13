import { UltimaBase } from '@ultimabase/core'
import { graphqlExplorerPlugin } from '@ultimabase/graphql-explorer-plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

// The explorer and Yoga introspection read `NODE_ENV` when created; explicit
// options stand in for `NODE_ENV=production` here.
const application = (environment: 'development' | 'production') => {
	const Production = UltimaBase.use(
		httpPlugin(),
		graphqlPlugin(),
		graphqlYogaPlugin({ introspection: false }),
		graphqlExplorerPlugin({ environment }),
		postgresPlugin(),
	)
	const Page = Production.Schema.define({
		className: 'Page',
		fields: (field) => ({ title: field.string() }),
	}).with({
		graphql: {
			findMany: true,
			createOne: false,
			updateOne: false,
			deleteOne: false,
		},
	})
	return new Production({ schemas: [Page] })
}

it('refuses an explorer without introspection', () => {
	// Creating the application already fails, naming the option to change.
	expect(() => application('development')).toThrow(
		'Plugin "@ultimabase/graphql-explorer-plugin" requires capability "ultimabase.graphql.introspection" version "^1.0.0", but no compatible provider is installed. Enable introspection, for example graphqlYogaPlugin({ introspection: true }), or stop serving the explorer in this environment.',
	)
})

it('serves neither the explorer nor introspection in production', async () => {
	await using t = await testApplication(application('production'))

	expect((await t.fetch('/graphiql')).status).toBe(404)
	const introspection = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: '{ __schema { queryType { name } } }' }),
	})
	expect(introspection.status).toBe(400)
	expect(await introspection.json()).toMatchObject({
		errors: [
			{
				message:
					'GraphQL introspection has been disabled, but the requested query contained the field "__schema".',
				extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
			},
			{ extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } },
		],
	})
	const query = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: '{ findManyPage { nodes { title } } }' }),
	})
	expect(await query.json()).toStrictEqual({
		data: { findManyPage: { nodes: [] } },
	})
})
