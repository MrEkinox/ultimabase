import {
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	definePlugin,
	provideCapability,
} from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpApplicationIdHeader, httpPlugin } from '@ultimabase/http-plugin'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'
import { createServer } from 'node:net'
import process from 'node:process'

class GraphqlYogaE2eDatabase {
	kind = 'database-adapter'
	capabilities = { persistencePlans: databasePersistencePlanCapability }

	execute() {
		return Promise.reject(new TypeError('GraphQL Yoga E2E does not query'))
	}

	beginTransaction() {
		return Promise.reject(new TypeError('GraphQL Yoga E2E does not mutate'))
	}
}

const databasePlugin = definePlugin({
	core: '^0.0.0',
	pluginId: 'fixture.graphql-yoga-e2e-database',
	version: '1.0.0',
	capabilities: {
		provides: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: new GraphqlYogaE2eDatabase() }),
			}),
		],
	},
})

const reservePort = () =>
	new Promise((resolve, reject) => {
		const server = createServer()
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			if (address === null || typeof address === 'string') {
				server.close()
				reject(new TypeError('GraphQL Yoga E2E port is unavailable'))
				return
			}
			server.close((error) => {
				if (error === undefined) resolve(address.port)
				else reject(error)
			})
		})
	})

const port = await reservePort()
const schema = new GraphQLSchema({
	query: new GraphQLObjectType({
		name: 'Query',
		fields: {
			value: { resolve: () => 'network-value', type: GraphQLString },
		},
	}),
})
const application = new UltimaBase({
	pluginPrivileges: { logger: false },
	plugins: [
		databasePlugin,
		httpPlugin({ appId: 'managed' }),
		graphqlPlugin({
			acknowledgeUnverifiedProtection: true,
			default: false,
			schemas: [schema],
		}),
		graphqlYogaPlugin(),
		honoServerPlugin({ host: '127.0.0.1', port }),
	],
	schemas: [],
})

await application.start()
let body
let status
try {
	const response = await globalThis.fetch(
		`http://127.0.0.1:${String(port)}/graphql`,
		{
			body: JSON.stringify({ query: '{ value }' }),
			headers: {
				'Content-Type': 'application/json',
				[httpApplicationIdHeader]: 'managed',
			},
			method: 'POST',
		},
	)
	status = response.status
	body = await response.json()
} finally {
	await application.dispose()
}

let closed = false
try {
	await globalThis.fetch(`http://127.0.0.1:${String(port)}/graphql`)
} catch {
	closed = true
}

process.stdout.write(JSON.stringify({ body, closed, status }))
