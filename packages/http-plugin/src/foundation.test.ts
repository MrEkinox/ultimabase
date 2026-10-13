import { UltimaBase } from '@ultimabase/core'
import {
	contributeApplication,
	plugin,
	requireCapability,
	type PluginDefinition,
} from '@ultimabase/core/plugin'
import { describe, expect, it, onTestFinished } from 'vitest'

import {
	httpApplicationCapability,
	type HttpApplication,
} from './application.js'
import { httpContextResolver, provideHttpContextResolvers } from './context.js'
import { httpMount, provideHttpEndpoints } from './endpoints.js'
import type { HttpRouteRecord } from './http-routes.js'
import type { HttpPluginOptions } from './options.js'
import { httpPlugin } from './plugin.js'
import { httpTestDatabasePlugin } from './test-database.test-support.js'

// Starts one application and returns its port-free HTTP entry (ADR-0323).
const start = async (
	options: HttpPluginOptions = {},
	plugins: readonly PluginDefinition[] = [],
	checkHealth?: () => Promise<void>,
) => {
	const application = new (UltimaBase.use(
		httpTestDatabasePlugin(checkHealth),
		httpPlugin(options),
		...plugins,
	))({ logger: false, schemas: [] })
	onTestFinished(() => application.dispose())
	await application.start()
	return application.plugin(httpPlugin)
}

const get = (path: string, headers: Record<string, string> = {}) =>
	new Request(`http://localhost${path}`, { headers })

const routes: HttpRouteRecord = {
	'GET /mode': (_request, { context }) =>
		Response.json({ mode: context.access.mode }),
}

describe('application identity (ADR-0323 decision 1)', () => {
	it('routes header-less requests to the only application, named main by default', async () => {
		const http = await start({ routes })
		expect(http.appId).toBe('main')
		expect(await (await http.fetch(get('/mode'))).json()).toStrictEqual({
			mode: 'anonymous',
		})
		const matching = await http.fetch(
			get('/mode', { 'X-UltimaBase-Application-Id': 'main' }),
		)
		expect(matching.status).toBe(200)
	})

	it('answers HTTP_APPLICATION_UNKNOWN for a different application ID', async () => {
		const http = await start({ appId: 'blog', routes })
		const response = await http.fetch(
			get('/mode', { 'X-UltimaBase-Application-Id': 'shop' }),
		)
		expect(response.status).toBe(404)
		expect(await response.json()).toMatchObject({
			error: {
				code: 'HTTP_APPLICATION_UNKNOWN',
				message: 'The HTTP application is unknown.',
			},
		})
	})

	it('restores the strict header with requireApplicationId', async () => {
		const http = await start({ requireApplicationId: true, routes })
		const missing = await http.fetch(get('/mode'))
		expect(missing.status).toBe(401)
		expect(await missing.json()).toMatchObject({
			error: { code: 'HTTP_APPLICATION_REJECTED' },
		})
		const identified = await http.fetch(
			get('/mode', { 'X-UltimaBase-Application-Id': 'main' }),
		)
		expect(identified.status).toBe(200)
		expect(() => httpPlugin({ requireApplicationId: 'yes' } as never)).toThrow(
			'HTTP plugin requireApplicationId must be a boolean',
		)
	})
})

describe('application routes (ADR-0323 decision 4)', () => {
	it('serves the httpRoutes record with the request context and its limits', async () => {
		const http = await start({
			master: true,
			routes: {
				'GET /mode': (request, { context }) =>
					Response.json({
						mode: context.access.mode,
						sawMasterHeader: request.headers.has('X-UltimaBase-Master-Key'),
					}),
				'POST /echo': {
					bodyLimit: 4,
					handle: async (request) => new Response(await request.text()),
				},
			},
		})
		expect(await (await http.fetch(get('/mode'))).json()).toStrictEqual({
			mode: 'anonymous',
			sawMasterHeader: false,
		})
		const small = await http.fetch(
			new Request('http://localhost/echo', { body: 'abcd', method: 'POST' }),
		)
		expect(await small.text()).toBe('abcd')
		const large = await http.fetch(
			new Request('http://localhost/echo', { body: 'abcde', method: 'POST' }),
		)
		expect(large.status).toBe(413)
	})

	it('rejects a malformed record when the plugin is created', () => {
		expect(() =>
			httpPlugin({ routes: { 'GET status': () => new Response() } as never }),
		).toThrow('HTTP route key must be "<METHOD> /<path>": "GET status"')
		expect(() =>
			httpPlugin({ routes: { 'GET /x': { handle: 'no' } } as never }),
		).toThrow('HTTP route GET /x handler must be a function')
		expect(() =>
			httpPlugin({
				routes: { 'GET /x': { handle: () => new Response(), extra: 1 } },
			} as never),
		).toThrow('HTTP route GET /x contains unknown option: extra')
		expect(() =>
			httpPlugin({
				routes: { 'GET /x': { bodyLimit: 0, handle: () => new Response() } },
			}),
		).toThrow('HTTP route GET /x bodyLimit must be a positive safe integer')
	})
})

describe('health route (ADR-0323 decision 5)', () => {
	it('answers 200 OK or 503 DEGRADED without leaking the cause', async () => {
		const healthy = await start()
		const ok = await healthy.fetch(get('/health'))
		expect(ok.status).toBe(200)
		expect(await ok.json()).toStrictEqual({ status: 'OK' })
	})

	it('reports DEGRADED when the database fails', async () => {
		const http = await start({}, [], () =>
			Promise.reject(new Error('database secret detail')),
		)
		const degraded = await http.fetch(get('/health'))
		expect(degraded.status).toBe(503)
		const body = await degraded.text()
		expect(JSON.parse(body)).toStrictEqual({ status: 'DEGRADED' })
		expect(body).not.toContain('secret')
	})

	// ADR-0303: probes send no application header, even in strict mode.
	it('answers without the application header under requireApplicationId', async () => {
		const strict = await start({ requireApplicationId: true, routes })
		const probe = await strict.fetch(get('/health'))
		expect(probe.status).toBe(200)
		expect(await probe.json()).toStrictEqual({ status: 'OK' })
		expect((await strict.fetch(get('/mode'))).status).toBe(401)
		expect((await strict.fetch(get('/missing'))).status).toBe(401)
		const other = await strict.fetch(
			get('/health', { 'X-UltimaBase-Application-Id': 'shop' }),
		)
		expect(other.status).toBe(404)
		const moved = await start({
			health: { path: '/healthz' },
			requireApplicationId: true,
		})
		expect((await moved.fetch(get('/healthz'))).status).toBe(200)
		expect((await moved.fetch(get('/health'))).status).toBe(401)
	})

	it('moves with health.path and disappears with health: false', async () => {
		const moved = await start({ health: { path: '/healthz' } })
		expect((await moved.fetch(get('/healthz'))).status).toBe(200)
		expect((await moved.fetch(get('/health'))).status).toBe(404)
	})

	it('can be removed', async () => {
		const removed = await start({ health: false })
		expect((await removed.fetch(get('/health'))).status).toBe(404)
		expect(() => httpPlugin({ health: { path: 3 } } as never)).toThrow(
			'HTTP plugin health path must be a string',
		)
	})

	it('serves every transport and collides with a route on its path', async () => {
		const mount = plugin({
			id: 'fixture.root-mount',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'transport:expose': 'Mounts a fixture at the root.' },
			contributions: [
				provideHttpEndpoints({
					contributionId: 'root',
					create: () =>
						httpMount({
							handle: () => new Response('mounted'),
							path: '/',
							protocol: { name: 'fixture.root', version: '1' },
						}),
				}),
			],
		})
		const application = new (UltimaBase.use(
			httpTestDatabasePlugin(),
			httpPlugin(),
			mount,
		))({ logger: false, schemas: [] })
		onTestFinished(() => application.dispose())
		await expect(application.start()).rejects.toThrow(
			'HTTP endpoint collision between route "/health" and mount "/"',
		)
	})
})

describe('port-free fetch() and network evidence (ADR-0323 decision 9)', () => {
	it('runs CORS, identity and the handler without a server', async () => {
		const http = await start({
			browser: { origins: ['https://app.example'] },
			routes,
		})
		const response = await http.fetch(
			get('/mode', { Origin: 'https://app.example' }),
		)
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
			'https://app.example',
		)
		expect(response.headers.get('X-UltimaBase-Request-Id')).toMatch(/.+/u)
		await expect(http.fetch('not a request' as never)).rejects.toThrow(
			'HTTP plugin fetch expects a Fetch Request',
		)
	})

	it('explains a request whose network headers were not captured', async () => {
		let application: HttpApplication | undefined
		const capture = plugin({
			id: 'fixture.capture',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				requirement,
				contributeApplication(({ capabilities }) => {
					application = capabilities.get(requirement)
					return { exports: undefined }
				}),
			],
		})
		await start({ routes }, [capture])
		if (application === undefined) throw new TypeError('Missing application')
		const response = await dispatchCaptured(application)
		expect(response.status).toBe(400)
		const { error } = (await response.json()) as {
			error: { code: string; message: string }
		}
		expect(error.code).toBe('HTTP_BAD_REQUEST')
		expect(error.message).toContain('carries no network connection headers')
	})
})

const requirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})

// A Fetch request with headers but no ordered originals, as a misconfigured server sends.
const dispatchCaptured = (application: HttpApplication) =>
	application.fetch({
		originalHeaders: [],
		request: get('/mode', { Accept: 'application/json' }),
	})

describe('CORS derived from the installed plugins (ADR-0323 decision 2)', () => {
	it('derives methods from routes and Authorization from credential plugins', async () => {
		const credentials = plugin({
			id: 'fixture.credentials',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideHttpContextResolvers({
					contributionId: 'bearer',
					create: () =>
						httpContextResolver({ resolve: ({ context }) => context }),
				}),
			],
		})
		const http = await start(
			{
				browser: { credentials: true, origins: ['https://app.example'] },
				master: true,
				routes: { 'POST /notes': () => new Response(null, { status: 201 }) },
			},
			[credentials],
		)
		expect(http.browser).toStrictEqual({
			allowedHeaders: [
				'Content-Type',
				'X-UltimaBase-Application-Id',
				'X-UltimaBase-Request-Id',
				'Authorization',
				'X-UltimaBase-Master-Key',
			],
			allowedMethods: ['GET', 'POST'],
			credentials: true,
			enabled: true,
			maxAgeSeconds: 600,
			origins: ['https://app.example'],
		})
		const preflight = await http.fetch(
			new Request('http://localhost/notes', {
				headers: {
					'Access-Control-Request-Headers': 'authorization, content-type',
					'Access-Control-Request-Method': 'POST',
					Origin: 'https://app.example',
				},
				method: 'OPTIONS',
			}),
		)
		expect(preflight.status).toBe(204)
		expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe(
			'GET, POST',
		)
	})

	it('refuses a preflight with the configuration hint when CORS is off', async () => {
		const http = await start({ routes })
		const preflight = await http.fetch(
			new Request('http://localhost/mode', {
				headers: {
					'Access-Control-Request-Method': 'GET',
					Origin: 'https://app.example',
				},
				method: 'OPTIONS',
			}),
		)
		expect(preflight.status).toBe(403)
		expect(await preflight.json()).toMatchObject({
			error: {
				code: 'HTTP_CORS_DISABLED',
				message: 'CORS is not enabled: configure browser.origins',
			},
		})
	})
})
