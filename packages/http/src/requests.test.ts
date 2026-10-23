// What a route reads and how it refuses (D-108): `validate`, a body that is
// not JSON, Hono's `HTTPException`, routes tested alone, the development
// log and the server's url.
import { hc } from 'hono/client'
import { HTTPException } from 'hono/http-exception'
import type { Logger, PluginTypes } from 'ultimabase'
import { defineApp, definePlugin, memory } from 'ultimabase'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { HttpApi, Routes, StandardSchema } from './index.ts'
import { httpPlugin, routes, validate } from './index.ts'

type Line = { readonly level: string; readonly first: unknown }
function recorder(lines: Line[]): Logger {
	const log = (level: string) => (first: string | object) => {
		lines.push({ level, first })
	}
	const logger: Logger = {
		info: log('info'),
		warn: log('warn'),
		error: log('error'),
		child: () => logger,
	}
	return logger
}

const environment = process.env['NODE_ENV']
let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
	process.env['NODE_ENV'] = environment
})

interface Http extends PluginTypes {
	readonly name: 'http'
	readonly api: HttpApi
}
interface Mounting extends PluginTypes {
	readonly name: 'mounting'
	readonly requires: Http
}
let http: HttpApi | undefined
const mounting = definePlugin<Mounting>({
	name: 'mounting',
	manifest: {
		name: 'mounting',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { http: httpPlugin },
	api: ({ plugins }) => {
		http = plugins.http
		plugins.http.mount(
			routes().get('/mounted', (c) => c.text(c.res.headers.get('x-app') ?? '')),
		)
	},
})

/** A started application serving `served`, and what it logged. */
async function serving(...served: Routes[]) {
	const lines: Line[] = []
	const app = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0, routes: served }), mounting.plugin()],
		models: [],
		logger: recorder(lines),
	})
	await app.start()
	stop = async () => app.stop()
	const url = http?.url() ?? ''
	return { app, lines, url }
}

const post = async (url: string, body: string) =>
	fetch(url, {
		method: 'POST',
		body,
		headers: { 'content-type': 'application/json' },
	})

const items = routes()
	.post('/items', validate('json', z.object({ name: z.string() })), (c) =>
		c.json({ named: c.req.valid('json').name }, 201),
	)
	.get('/search', validate('query', z.object({ q: z.string().min(2) })), (c) =>
		c.json({ q: c.req.valid('query').q }),
	)

describe('validate', () => {
	it('gives the route the value the schema accepts, typed', async () => {
		const { url } = await serving(items)
		const created = await post(`${url}/items`, '{"name":"lamp"}')
		expect(created.status).toBe(201)
		expect(await created.json()).toStrictEqual({ named: 'lamp' })
		const found = await fetch(`${url}/search?q=la`)
		expect(await found.json()).toStrictEqual({ q: 'la' })
		const client = hc<typeof items>(url)
		const sent = await client.items.$post({ json: { name: 'desk' } })
		const read = await sent.json()
		expectTypeOf(read).toEqualTypeOf<{ named: string }>()
		expect(read).toStrictEqual({ named: 'desk' })
	})

	it('refuses what the schema refuses, as the kernel does', async () => {
		const { url, lines } = await serving(items)
		const wrong = await post(`${url}/items`, '{"name":1}')
		expect(wrong.status).toBe(400)
		expect(await wrong.json()).toStrictEqual({
			code: 'VALIDATION_FAILED',
			message: 'Invalid data.',
			details: {
				issues: [
					{
						path: ['name'],
						message: 'Invalid input: expected string, received number',
					},
				],
			},
		})
		const short = await fetch(`${url}/search?q=l`)
		expect(await short.json()).toMatchObject({
			details: { issues: [{ path: ['q'] }] },
		})
		expect(lines.filter((line) => line.level === 'error')).toStrictEqual([])
	})

	it('reads any Standard Schema, its path segments and its absent path', async () => {
		const symbol = Symbol('tag')
		const schema: StandardSchema = {
			'~standard': {
				validate: async () => ({
					issues: [
						{ message: 'Deep.', path: [{ key: 'a' }, 0, symbol] },
						{ message: 'Whole.' },
					],
				}),
			},
		}
		const loose = routes().post('/loose', validate('json', schema), (c) =>
			c.json(c.req.valid('json')),
		)
		const { url } = await serving(loose)
		const refused = await post(`${url}/loose`, '{}')
		expect(await refused.json()).toMatchObject({
			details: {
				issues: [
					{ path: ['a', 0, 'Symbol(tag)'], message: 'Deep.' },
					{ path: [], message: 'Whole.' },
				],
			},
		})
	})
})

describe('a body that is not JSON', () => {
	const raw = routes()
		.post('/raw', async (c) => c.json(await c.req.json()))
		.post('/twice', async (c) => {
			await c.req.raw.text()
			return c.json(await c.req.json())
		})

	it('is the client’s error, read by a route or by validate', async () => {
		const { url, lines } = await serving(raw, items)
		for (const path of ['/raw', '/items']) {
			const malformed = await post(`${url}${path}`, '{oops')
			expect(malformed.status).toBe(400)
			expect(await malformed.json()).toStrictEqual({
				code: 'BAD_REQUEST',
				message: 'Malformed JSON in request body',
			})
		}
		expect(lines.filter((line) => line.level === 'error')).toStrictEqual([])
		const fine = await post(`${url}/raw`, '{"a":1}')
		expect(await fine.json()).toStrictEqual({ a: 1 })
	})

	it('keeps any other failure to read the body the server’s', async () => {
		const { url } = await serving(raw)
		const unusable = await post(`${url}/twice`, '{}')
		expect(unusable.status).toBe(500)
	})
})

describe('an HTTPException', () => {
	const refusing = routes()
		.get('/expired', () => {
			throw new HTTPException(401, { message: 'Token expired.' })
		})
		.get('/bare', () => {
			throw new HTTPException(429)
		})
		.get('/nameless', () => {
			throw new HTTPException(306)
		})
		.get('/own', () => {
			throw new HTTPException(402, { res: new Response('Pay first.') })
		})

	it('keeps its status, its message and its response', async () => {
		const { url, lines } = await serving(refusing)
		const expired = await fetch(`${url}/expired`)
		expect(expired.status).toBe(401)
		expect(await expired.json()).toStrictEqual({
			code: 'UNAUTHORIZED',
			message: 'Token expired.',
		})
		expect(await (await fetch(`${url}/bare`)).json()).toStrictEqual({
			code: 'TOO_MANY_REQUESTS',
			message: 'Too Many Requests',
		})
		expect(await (await fetch(`${url}/nameless`)).json()).toStrictEqual({
			code: 'HTTP_306',
			message: 'HTTP_306',
		})
		const own = await fetch(`${url}/own`)
		expect(own.status).toBe(402)
		expect(await own.text()).toBe('Pay first.')
		expect(lines.filter((line) => line.level === 'error')).toStrictEqual([])
	})
})

describe('routes alone', () => {
	it('hold the anonymous caller, and refuse a body that is not JSON', async () => {
		const alone = routes()
			.get('/who', (c) => c.json(c.var.caller))
			.post('/raw', async (c) => c.json(await c.req.json()))
		expect(await (await alone.request('/who')).json()).toStrictEqual({
			kind: 'anonymous',
		})
		const malformed = await alone.request('/raw', {
			method: 'POST',
			body: '{oops',
		})
		expect(malformed.status).toBe(400)
	})
})

describe('a middleware of the application', () => {
	it('runs for the routes after it, other plugins’ included', async () => {
		const own = routes()
			.use(async (c, next) => {
				await next()
				c.header('x-app', 'seen')
			})
			.use('/admin/*', async (c, next) => {
				await next()
				c.header('x-admin', 'seen')
			})
			.get('/admin/panel', (c) => c.text('panel'))
		const { url } = await serving(own)
		const mounted = await fetch(`${url}/mounted`)
		expect(mounted.headers.get('x-app')).toBe('seen')
		expect(mounted.headers.get('x-admin')).toBeNull()
		const panel = await fetch(`${url}/admin/panel`)
		expect(panel.headers.get('x-admin')).toBe('seen')
	})
})

describe('the development log', () => {
	const ping = routes().get('/ping', (c) => c.text('pong'))

	it('logs each request once answered, outside production', async () => {
		const { url, lines } = await serving(ping)
		await fetch(`${url}/ping`)
		await fetch(`${url}/nowhere?x=1`)
		const logged = lines
			.map((line) => String(line.first))
			.filter((line) => /^[A-Z]+ \//.test(line))
		expect(logged).toHaveLength(2)
		expect(logged[0]).toMatch(/^GET \/ping 200 \d+ms$/)
		expect(logged[1]).toMatch(/^GET \/nowhere 404 \d+ms$/)
	})

	it('logs no request in production', async () => {
		process.env['NODE_ENV'] = 'production'
		const { url, lines } = await serving(ping)
		await fetch(`${url}/ping`)
		const logged = lines.filter((line) => String(line.first).startsWith('GET'))
		expect(logged).toStrictEqual([])
	})
})

describe('url', () => {
	it('is where the server listens, once it started', async () => {
		const { app, url, lines } = await serving()
		expect(url).toMatch(/^http:\/\/localhost:\d+$/)
		expect(lines).toContainEqual({
			level: 'info',
			first: `Listening on ${url}.`,
		})
		await app.stop()
		stop = undefined
		expect(() => http?.url()).toThrow(
			"The HTTP server is not running: read its url from your plugin's start (D-108).",
		)
	})
})
