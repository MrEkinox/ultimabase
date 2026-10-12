import { onTestFinished, describe, expect, it } from 'vitest'
import { UltimaBase } from '@ultimabase/core'
import {
	contributeApplication,
	plugin,
	requireCapability,
} from '@ultimabase/core/plugin'

import {
	httpApplicationCapability,
	type HttpApplication,
} from './application.js'
import { httpRoutes, type HttpRouteKey } from './http-routes.js'
import { httpPlugin } from './plugin.js'
import { httpTestDatabasePlugin } from './test-database.test-support.js'

const applicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)

const start = async (
	routes: Readonly<Record<HttpRouteKey, (request: Request) => Response>>,
) => {
	let http: HttpApplication | undefined
	const routesPlugin = plugin({
		id: 'fixture.http-routes',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [httpRoutes(routes)],
	})
	const capture = plugin({
		id: 'fixture.http-routes-capture',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			applicationRequirement,
			contributeApplication(({ capabilities }) => {
				http = capabilities.get(applicationRequirement)
				return { exports: undefined }
			}),
		],
	})
	const application = new (UltimaBase.use(
		httpTestDatabasePlugin(),
		routesPlugin,
		httpPlugin({ appId: 'routes', health: false }),
		capture,
	))({ logger: false, schemas: [] })
	onTestFinished(() => application.dispose())
	await application.start()
	if (http === undefined) throw new TypeError('HTTP application missing')
	return http
}

const fetchRoute = (http: HttpApplication, path: string, method = 'GET') =>
	http.fetch({
		originalHeaders: [['X-UltimaBase-Application-Id', 'routes']],
		request: new Request(`http://localhost${path}`, { method }),
	})

describe('httpRoutes (ADR-0316)', () => {
	it('contributes one owned route per key, named by its key', async () => {
		const http = await start({
			'GET /health': () => Response.json({ status: 'ok' }),
			'POST /ping': (request) => new Response(request.method),
		})

		expect(
			http.routeGraph.endpoints.map(({ kind, path, protocol }) => ({
				kind,
				path,
				protocol,
			})),
		).toEqual([
			{
				kind: 'route',
				path: '/health',
				protocol: { name: 'GET /health', version: '1.0.0' },
			},
			{
				kind: 'route',
				path: '/ping',
				protocol: { name: 'POST /ping', version: '1.0.0' },
			},
		])
		await expect((await fetchRoute(http, '/health')).json()).resolves.toEqual({
			status: 'ok',
		})
		await expect(
			(await fetchRoute(http, '/ping', 'POST')).text(),
		).resolves.toBe('POST')
		expect((await fetchRoute(http, '/ping')).status).toBe(404)
	})

	it('rejects malformed keys and handlers when the plugin is defined', () => {
		for (const key of ['GET health', 'FETCH /health', 'GET', ' /health']) {
			expect(() =>
				httpRoutes({ [key]: () => new Response('x') } as never),
			).toThrow(
				`HTTP route key must be "<METHOD> /<path>": ${JSON.stringify(key)}`,
			)
		}
		expect(() => httpRoutes({ 'GET /x': 'nope' } as never)).toThrow(
			'HTTP route GET /x handler must be a function',
		)
		expect(() => httpRoutes(null as never)).toThrow(
			'httpRoutes expects a plain object of handlers',
		)
	})
})
