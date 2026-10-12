import { onTestFinished } from 'vitest'
import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { httpApplicationIdHeader, httpPlugin } from '@ultimabase/http-plugin'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { graphqlYogaPlugin } from './plugin.js'
import { graphqlYogaFixtureDatabasePlugin } from './test-application.test-support.js'

const schemaReturning = (value: string): GraphQLSchema =>
	new GraphQLSchema({
		query: new GraphQLObjectType({
			name: 'Query',
			fields: {
				value: { resolve: () => value, type: GraphQLString },
			},
		}),
	})

const createApplication = (
	appId: string,
	value: string,
	server: ReturnType<typeof honoServerPlugin>,
	browser = false,
) => {
	const Application = UltimaBase.use(graphqlYogaFixtureDatabasePlugin)
		.use(
			httpPlugin({
				appId,
				...(browser
					? {
							browser: {
								origins: ['https://console.example'],
								credentials: false,
								maxAgeSeconds: 300,
							},
						}
					: {}),
			}),
		)
		.use(
			graphqlPlugin({
				publicWrites: true,
				default: false,
				schemas: [schemaReturning(value)],
			}),
		)
		.use(graphqlYogaPlugin())
		.use(server)
	const application = new Application({
		logger: false,
		schemas: [],
	})
	onTestFinished(() => application.dispose())
	return application
}

const rawEnvironment = (appId: string) => ({
	incoming: {
		rawHeaders: [httpApplicationIdHeader, appId],
	},
})

const graphqlRequest = (): Request =>
	new Request('http://localhost/graphql', {
		body: JSON.stringify({ query: '{ value }' }),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
	})

describe('GraphQL Yoga Hono integration', () => {
	it('isolates sequential applications in one existing Hono provider', async () => {
		const hono = new Hono()
		const server = honoServerPlugin({
			app: hono,
			browserPolicyOwner: 'ultimabase',
		})
		const first = createApplication('first', 'first-value', server, true)
		const second = createApplication('second', 'second-value', server, true)
		await first.start()

		const firstResponse = await hono.fetch(
			graphqlRequest(),
			rawEnvironment('first'),
		)
		await first.dispose()
		await second.start()
		const secondResponse = await hono.fetch(
			graphqlRequest(),
			rawEnvironment('second'),
		)
		expect(await firstResponse.json()).toEqual({
			data: { value: 'first-value' },
		})
		expect(await secondResponse.json()).toEqual({
			data: { value: 'second-value' },
		})

		const preflight = await hono.fetch(
			new Request('http://localhost/graphql', {
				headers: {
					'Access-Control-Request-Headers': `${httpApplicationIdHeader}, Content-Type`,
					'Access-Control-Request-Method': 'POST',
					Origin: 'https://console.example',
				},
				method: 'OPTIONS',
			}),
			{
				incoming: {
					rawHeaders: [
						'Access-Control-Request-Headers',
						`${httpApplicationIdHeader}, Content-Type`,
						'Access-Control-Request-Method',
						'POST',
						'Origin',
						'https://console.example',
					],
				},
			},
		)
		expect(preflight.status).toBe(204)
		expect(preflight.headers.get('access-control-allow-origin')).toBe(
			'https://console.example',
		)

		await first.stop()
		const removed = await hono.fetch(graphqlRequest(), rawEnvironment('first'))
		expect(removed.status).toBe(404)
		const retained = await hono.fetch(
			graphqlRequest(),
			rawEnvironment('second'),
		)
		expect(await retained.json()).toEqual({
			data: { value: 'second-value' },
		})
		await Promise.all([first.dispose(), second.dispose()])
	})
})
