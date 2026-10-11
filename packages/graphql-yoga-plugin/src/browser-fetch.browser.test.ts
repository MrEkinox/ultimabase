import { serve, type ServerType } from '@hono/node-server'
import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { httpApplicationIdHeader, httpPlugin } from '@ultimabase/http-plugin'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'
import { Hono } from 'hono'
import { createServer, type Server } from 'node:http'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'

import { graphqlYogaPlugin } from './plugin.js'
import { graphqlYogaFixtureDatabasePlugin } from './test-application.test-support.js'

interface BrowserGraphqlResult {
	readonly body: unknown
	readonly status: number
}

const closeServer = (server: Server | ServerType): Promise<void> =>
	new Promise((resolve, reject) => {
		server.close((error?: Error) => {
			if (error === undefined) resolve()
			else reject(error)
		})
	})

const startOriginServer = (): Promise<Server> =>
	new Promise((resolve, reject) => {
		const server = createServer((_request, response) => {
			response.setHeader('Content-Type', 'text/html; charset=utf-8')
			response.end('<!doctype html><title>GraphQL Yoga browser fixture</title>')
		})
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			server.removeListener('error', reject)
			resolve(server)
		})
	})

const startHonoServer = (app: Hono): Promise<ServerType> =>
	new Promise((resolve, reject) => {
		const server = serve(
			{
				fetch: app.fetch,
				hostname: '127.0.0.1',
				overrideGlobalObjects: false,
				port: 0,
			},
			() => {
				server.removeListener('error', reject)
				resolve(server)
			},
		)
		server.once('error', reject)
	})

const readOrigin = (server: Server | ServerType): string => {
	const address = server.address()
	if (typeof address !== 'object' || address === null) {
		throw new TypeError('Missing GraphQL Yoga browser listener address')
	}
	return `http://127.0.0.1:${String(address.port)}`
}

it('serves GraphQL through a real browser Fetch boundary', async () => {
	const originServer = await startOriginServer()
	const browserOrigin = readOrigin(originServer)
	const app = new Hono()
	const ultimabase = new (UltimaBase.use(
		graphqlYogaFixtureDatabasePlugin,
		httpPlugin({
			appId: 'browser-graphql',
			browser: {
				allowedHeaders: ['Content-Type', httpApplicationIdHeader],
				allowedMethods: ['POST'],
				allowedOrigins: [browserOrigin],
				credentials: false,
				maxAgeSeconds: 300,
			},
		}),
		graphqlPlugin({
			acknowledgeUnverifiedProtection: true,
			default: false,
			schemas: [
				new GraphQLSchema({
					query: new GraphQLObjectType({
						name: 'Query',
						fields: {
							value: {
								resolve: () => 'browser-value',
								type: GraphQLString,
							},
						},
					}),
				}),
			],
		}),
		graphqlYogaPlugin(),
		honoServerPlugin({
			app,
			browserPolicyOwner: 'ultimabase',
		}),
	))({ logger: false, schemas: [] })
	let targetServer: ServerType | undefined
	const browser = await chromium.launch({ headless: true })

	try {
		await ultimabase.start()
		targetServer = await startHonoServer(app)
		const page = await browser.newPage()
		await page.goto(browserOrigin)
		const result = await page.evaluate(
			async ({
				applicationHeader,
				targetUrl,
			}): Promise<BrowserGraphqlResult> => {
				const response = await fetch(targetUrl, {
					body: JSON.stringify({ query: '{ value }' }),
					headers: {
						'Content-Type': 'application/json',
						[applicationHeader]: 'browser-graphql',
					},
					method: 'POST',
				})
				return {
					body: await response.json(),
					status: response.status,
				}
			},
			{
				applicationHeader: httpApplicationIdHeader,
				targetUrl: `${readOrigin(targetServer)}/graphql`,
			},
		)

		expect(result).toStrictEqual({
			body: { data: { value: 'browser-value' } },
			status: 200,
		})
	} finally {
		await browser.close()
		if (targetServer !== undefined) await closeServer(targetServer)
		await ultimabase.dispose()
		await closeServer(originServer)
	}
})
