// `httpPlugin()` (D-66, D-106): routes that read the caller, no caching,
// errors as D-72 sends them, CORS, forms from other origins, the body limit,
// the port, the client's address behind proxies (D-116), a stop that waits,
// 10 s at most, and the reset route outside production (D-188).
import { createServer, IncomingMessage } from 'node:http'
import { connect, Socket } from 'node:net'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Logger, PluginTypes } from 'ultimabase'
import {
	defineApp,
	defineModel,
	definePlugin,
	memory,
	PublicError,
	master as root,
} from 'ultimabase'
import type { HttpApi, HttpEnv, Routes } from './index.ts'
import { clientOf, httpPlugin, routes } from './index.ts'
import { addresses } from './address.ts'
import {
	bodyLimitOf,
	closed,
	drainOf,
	listening as listeningOn,
	portOf,
} from './server.ts'

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

type Line = {
	readonly level: string
	readonly first: unknown
	readonly message?: string
}
function recorder(lines: Line[]): Logger {
	const at = (level: string) => (first: string | object, message?: string) => {
		lines.push(
			message === undefined ? { level, first } : { level, first, message },
		)
	}
	const logger: Logger = {
		info: at('info'),
		warn: at('warn'),
		error: at('error'),
		child: () => logger,
	}
	return logger
}

const environment = { ...process.env }
afterEach(() => {
	process.env['NODE_ENV'] = environment['NODE_ENV']
	if (environment['PORT'] === undefined) delete process.env['PORT']
	else process.env['PORT'] = environment['PORT']
})

const notes = routes()
notes.get('/caller', (c) => c.json(c.var.caller))
notes.get('/public', (c) => {
	c.header('cache-control', 'public, max-age=60')
	return c.text('public')
})
// Its headers are immutable.
notes.get('/moved', () => Response.redirect('http://localhost/public', 301))
notes.post('/notes', async (c) => {
	const { text } = await c.req.json<{ text: string }>()
	const note = await Note.create({ data: { text } }, { as: c.var.caller })
	return c.json({ text: note.text }, 201)
})

const manifest = {
	name: 'mounting',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}
interface Http extends PluginTypes {
	readonly name: 'http'
	readonly api: HttpApi
}
interface Mounting extends PluginTypes {
	readonly name: 'mounting'
	readonly requires: Http
}
let late: HttpApi | undefined
const mounting = definePlugin<Mounting>({
	name: 'mounting',
	manifest,
	requires: { http: httpPlugin },
	api: ({ plugins }) => {
		late = plugins.http
		plugins.http.mount(
			routes()
				.get('/a', (c) => c.text('mounted'))
				.get('/mounted', (c) => c.json(c.var.caller)),
		)
	},
})

interface Reading extends PluginTypes {
	readonly name: 'reading'
	readonly requires: Http
}
const length = async (c: Context<HttpEnv>) =>
	c.text(String((await c.req.arrayBuffer()).byteLength))
// Routes that read their own body (D-153).
const ownBody = definePlugin<Reading>({
	name: 'reading',
	manifest: { ...manifest, name: 'reading' },
	requires: { http: httpPlugin },
	api: ({ plugins }) => {
		plugins.http.mount(routes().post('/raw', length).all('/any', length), {
			bodyLimit: false,
		})
	},
})

type Mounted =
	ReturnType<typeof mounting.plugin> | ReturnType<typeof ownBody.plugin>

/** A started application on a free port, and what it logged. */
async function started(
	options: Parameters<typeof httpPlugin>[0] = {},
	...others: readonly Mounted[]
) {
	const lines: Line[] = []
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0, routes: [notes], drain: 0, ...options }),
			...others,
		],
		models: [Note],
		masterKey: 'secret',
		logger: recorder(lines),
	})
	await app.start()
	const listening = lines.find(
		(line) =>
			typeof line.first === 'string' && line.first.startsWith('Listening on'),
	)
	const url = String(listening?.first).replace(/^Listening on (.*)\.$/, '$1')
	return { app, lines, url }
}

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})
async function server(
	options?: Parameters<typeof httpPlugin>[0],
	...others: readonly Mounted[]
) {
	const running = await started(options, ...others)
	stop = async () => running.app.stop()
	return running
}

describe('a route', () => {
	it('reads the caller, anonymous or Master with the key', async () => {
		const { url } = await server()
		const anonymous = await fetch(`${url}/caller`)
		expect(await anonymous.json()).toStrictEqual({ kind: 'anonymous' })
		const master = await fetch(`${url}/caller`, {
			headers: { 'x-ultimabase-master-key': 'secret' },
		})
		expect(await master.json()).toStrictEqual({
			kind: 'master',
			master: { source: 'key' },
		})
	})

	it('runs a query as its caller', async () => {
		const { url } = await server()
		const body = JSON.stringify({ text: 'a' })
		const created = await fetch(`${url}/notes`, {
			method: 'POST',
			body,
			headers: { 'x-ultimabase-master-key': 'secret' },
		})
		expect(created.status).toBe(201)
		expect(await created.json()).toStrictEqual({ text: 'a' })
		const refused = await fetch(`${url}/notes`, { method: 'POST', body })
		expect(refused.status).toBe(403)
		expect(await refused.json()).toMatchObject({ code: 'ACCESS_DENIED' })
	})

	it('mounts chained routes, in their order', async () => {
		const first = routes()
			.get('/a', (c) => c.text('first'))
			.get('/b', (c) => c.text('b'))
		const second: Routes = routes().get('/a', (c) => c.text('second'))
		const { url } = await server({ port: 0, routes: [first, second] })
		expect(await (await fetch(`${url}/a`)).text()).toBe('first')
		expect(await (await fetch(`${url}/b`)).text()).toBe('b')
	})
})

describe('a response', () => {
	it('is kept by no cache, unless its route says otherwise', async () => {
		const { url } = await server()
		const cached = async (path: string) =>
			(await fetch(`${url}${path}`, { redirect: 'manual' })).headers.get(
				'cache-control',
			)
		expect([
			await cached('/caller'),
			await cached('/nowhere'),
			await cached('/moved'),
			await cached('/public'),
		]).toStrictEqual(['no-store', 'no-store', 'no-store', 'public, max-age=60'])
	})
})

describe('mount', () => {
	it('adds a plugin’s routes after the application’s', async () => {
		const own = routes().get('/a', (c) => c.text('own'))
		const { url } = await server({ routes: [own] }, mounting.plugin())
		expect(await (await fetch(`${url}/a`)).text()).toBe('own')
		const master = await fetch(`${url}/mounted`, {
			headers: { 'x-ultimabase-master-key': 'secret' },
		})
		expect(await master.json()).toMatchObject({ kind: 'master' })
	})

	it('throws once the server runs', async () => {
		await server({}, mounting.plugin())
		expect(() => late?.mount(routes())).toThrow(
			"The HTTP server is running: mount routes from your plugin's api.",
		)
	})
})

describe('an error', () => {
	const failing = routes()
	failing.get('/locked', () => {
		throw new PublicError('DOCUMENT_LOCKED', 'This document is locked.', {
			details: { by: 'Ada' },
		})
	})
	failing.get('/missing', () => {
		throw new PublicError('NOT_FOUND', 'No such invoice.')
	})
	failing.get('/wrong', () => {
		throw new PublicError('INVALID_CREDENTIALS', 'Wrong email or password.')
	})
	failing.get('/full', () => {
		throw new PublicError(
			'RELATION_SIZE',
			'Poll.choices holds 2 to 4 rows: this write leaves 5.',
		)
	})
	failing.get('/conflict', () => {
		throw new PublicError(
			'CONFLICT',
			'This operation conflicted with another; try it again.',
		)
	})
	failing.get('/crash', () => {
		throw new Error('Connection refused.')
	})
	failing.get('/thrown', () => {
		throw 'Connection refused.'
	})
	failing.get('/busy', () => {
		throw new PublicError('TOO_MANY_ATTEMPTS', 'Wait a minute.', {
			details: { retryAfter: 60 },
		})
	})

	failing.get('/down', () => {
		throw new PublicError(
			'UNAVAILABLE',
			'The database is busy: try again shortly.',
			{ details: { retryAfter: 1 } },
		)
	})

	it('sends a database it cannot use as 503, with when to retry (D-335)', async () => {
		const { url } = await server({ port: 0, routes: [failing] })
		const down = await fetch(`${url}/down`)
		expect(down.status).toBe(503)
		expect(down.headers.get('retry-after')).toBe('1')
		expect(await down.json()).toStrictEqual({
			code: 'UNAVAILABLE',
			message: 'The database is busy: try again shortly.',
			details: { retryAfter: 1 },
		})
	})

	it('sends too many attempts as 429, with when to retry', async () => {
		const { url } = await server({ port: 0, routes: [failing] })
		const busy = await fetch(`${url}/busy`)
		expect(busy.status).toBe(429)
		expect(busy.headers.get('retry-after')).toBe('60')
		expect(await busy.json()).toStrictEqual({
			code: 'TOO_MANY_ATTEMPTS',
			message: 'Wait a minute.',
			details: { retryAfter: 60 },
		})
		const locked = await fetch(`${url}/locked`)
		expect(locked.headers.get('retry-after')).toBeNull()
	})

	it('sends a public error with its status and details', async () => {
		const { url } = await server({ port: 0, routes: [failing] })
		const locked = await fetch(`${url}/locked`)
		expect(locked.status).toBe(400)
		expect(await locked.json()).toStrictEqual({
			code: 'DOCUMENT_LOCKED',
			message: 'This document is locked.',
			details: { by: 'Ada' },
		})
		const missing = await fetch(`${url}/missing`)
		expect(missing.status).toBe(404)
		expect(await missing.json()).toStrictEqual({
			code: 'NOT_FOUND',
			message: 'No such invoice.',
		})
		const wrong = await fetch(`${url}/wrong`)
		expect(wrong.status).toBe(401)
		const conflict = await fetch(`${url}/conflict`)
		expect(conflict.status).toBe(409)
		const full = await fetch(`${url}/full`)
		expect(full.status).toBe(409)
	})

	it('masks any other error, and logs it with its correlation id', async () => {
		const { url, lines } = await server({ port: 0, routes: [failing] })
		const crash = await fetch(`${url}/crash`)
		expect(crash.status).toBe(500)
		const body: unknown = await crash.json()
		const correlationId: unknown = Reflect.get(Object(body), 'correlationId')
		expect(typeof correlationId).toBe('string')
		expect(body).toStrictEqual({
			code: 'INTERNAL',
			message: 'Internal error.',
			correlationId,
		})
		const logged = lines.find((line) => line.level === 'error')
		expect(logged?.message).toBe('A request failed.')
		expect(logged?.first).toStrictEqual({
			correlationId,
			err: new Error('Connection refused.'),
		})
		expect(JSON.stringify(body)).not.toContain('Connection refused')
	})

	it('masks a thrown value that is not an Error, as one', async () => {
		const { url, lines } = await server({ port: 0, routes: [failing] })
		const thrown = await fetch(`${url}/thrown`)
		expect(thrown.status).toBe(500)
		const body: unknown = await thrown.json()
		const correlationId: unknown = Reflect.get(Object(body), 'correlationId')
		expect(body).toStrictEqual({
			code: 'INTERNAL',
			message: 'Internal error.',
			correlationId,
		})
		const logged = lines.find((line) => line.level === 'error')
		expect(logged?.first).toStrictEqual({
			correlationId,
			err: 'Connection refused.',
		})
	})

	it('refuses a wrong master key', async () => {
		const { url } = await server()
		const wrong = await fetch(`${url}/caller`, {
			headers: { 'x-ultimabase-master-key': 'wrong' },
		})
		expect(wrong.status).toBe(403)
		expect(await wrong.json()).toStrictEqual({
			code: 'ACCESS_DENIED',
			message: 'The master key is wrong.',
		})
	})

	it('names an unknown route', async () => {
		const { url } = await server()
		const unknown = await fetch(`${url}/nowhere`, { method: 'DELETE' })
		expect(unknown.status).toBe(404)
		expect(await unknown.json()).toStrictEqual({
			code: 'NOT_FOUND',
			message: 'No route matches DELETE /nowhere.',
		})
	})

	it('refuses a body over the limit', async () => {
		const { url } = await server({ port: 0, routes: [notes], bodyLimit: 10 })
		const large = await fetch(`${url}/notes`, {
			method: 'POST',
			body: JSON.stringify({ text: 'more than ten bytes' }),
		})
		expect(large.status).toBe(413)
		expect(await large.json()).toStrictEqual({
			code: 'PAYLOAD_TOO_LARGE',
			message: 'The body is over 10 bytes.',
		})
	})

	it('refuses a body over the limit that declares no length', async () => {
		const { url } = await server({ port: 0, routes: [notes], bodyLimit: 10 })
		const encoded = new TextEncoder().encode('more than ten bytes')
		const large = await fetch(`${url}/notes`, {
			method: 'POST',
			duplex: 'half',
			body: new ReadableStream({
				start: (controller) => {
					controller.enqueue(encoded)
					controller.close()
				},
			}),
		})
		expect(large.status).toBe(413)
	})

	it('reads a body under the limit, with its length or without', async () => {
		const echo = routes().post('/echo', async (c) => c.json(await c.req.json()))
		const { url } = await server({ port: 0, routes: [echo] })
		const encoded = new TextEncoder().encode(JSON.stringify({ text: 'hi' }))
		const declared = await fetch(`${url}/echo`, {
			method: 'POST',
			body: encoded,
		})
		expect(await declared.json()).toStrictEqual({ text: 'hi' })
		const undeclared = await fetch(`${url}/echo`, {
			method: 'POST',
			duplex: 'half',
			body: new ReadableStream({
				start: (controller) => {
					controller.enqueue(encoded)
					controller.close()
				},
			}),
		})
		expect(await undeclared.json()).toStrictEqual({ text: 'hi' })
	})

	it("lifts the limit for a mount's routes that read their own body", async () => {
		const { url } = await server({ port: 0, bodyLimit: 10 }, ownBody.plugin())
		const body = 'more than ten bytes'
		const raw = await fetch(`${url}/raw`, { method: 'POST', body })
		expect(await raw.text()).toBe(String(body.length))
		// `all` is a middleware's, which matches any request.
		const any = await fetch(`${url}/any`, { method: 'POST', body })
		expect(any.status).toBe(413)
		const json = await fetch(`${url}/notes`, { method: 'POST', body })
		expect(json.status).toBe(413)
	})
})

const allowed = async (url: string, origin: string) =>
	(await fetch(`${url}/caller`, { headers: { origin } })).headers.get(
		'access-control-allow-origin',
	)

describe('CORS', () => {
	it('allows the listed origins and local ones, no other', async () => {
		const { url } = await server({
			port: 0,
			routes: [notes],
			cors: ['https://app.example.com'],
		})
		expect(await allowed(url, 'https://app.example.com')).toBe(
			'https://app.example.com',
		)
		expect(await allowed(url, 'http://localhost:5173')).toBe(
			'http://localhost:5173',
		)
		expect(await allowed(url, 'http://127.0.0.1:8080')).toBe(
			'http://127.0.0.1:8080',
		)
		// The hosts auth expects an insecure cookie on (D-115).
		for (const origin of ['http://app.localhost:5173', 'http://[::1]:5173']) {
			expect(await allowed(url, origin)).toBe(origin)
		}
		expect(await allowed(url, 'http://localhost.example.com')).toBeNull()
		expect(await allowed(url, 'https://evil.example.com')).toBeNull()
		expect(await allowed(url, 'https://localhost:5173')).toBeNull()
		expect(await allowed(url, 'not an origin')).toBeNull()
	})

	it('allows no local origin in production', async () => {
		process.env['NODE_ENV'] = 'production'
		const { url } = await server()
		expect(await allowed(url, 'http://localhost:5173')).toBeNull()
	})

	it('lets an allowed origin read an error and send the master key', async () => {
		const { url } = await server()
		const origin = 'http://localhost:5173'
		const refused = await fetch(`${url}/caller`, {
			headers: { origin, 'x-ultimabase-master-key': 'wrong' },
		})
		expect(refused.headers.get('access-control-allow-origin')).toBe(origin)
		expect(refused.headers.get('access-control-allow-credentials')).toBe('true')
		const preflight = await fetch(`${url}/caller`, {
			method: 'OPTIONS',
			headers: {
				origin,
				'access-control-request-method': 'GET',
				'access-control-request-headers': 'x-ultimabase-master-key',
			},
		})
		expect(preflight.status).toBe(204)
		expect(preflight.headers.get('access-control-allow-headers')).toBe(
			'x-ultimabase-master-key',
		)
		expect(preflight.headers.get('access-control-allow-credentials')).toBe(
			'true',
		)
	})

	it('answers only a preflight itself, and lets a route answer OPTIONS', async () => {
		const origin = 'http://localhost:5173'
		const options = routes().options('/things', (c) => c.text('allowed'))
		const { url } = await server({ port: 0, routes: [options] })
		const own = await fetch(`${url}/things`, {
			method: 'OPTIONS',
			headers: { origin },
		})
		expect(await own.text()).toBe('allowed')
		expect(own.headers.get('access-control-allow-origin')).toBe(origin)
		expect(own.headers.get('vary')).toBe('Origin')
		expect(own.headers.get('access-control-allow-credentials')).toBe('true')
		const foreign = await fetch(`${url}/things`, {
			method: 'OPTIONS',
			headers: { origin: 'https://evil.example.com' },
		})
		expect(foreign.headers.get('access-control-allow-origin')).toBeNull()
		expect(foreign.headers.get('access-control-allow-credentials')).toBeNull()
		const unknown = await fetch(`${url}/nowhere`, { method: 'OPTIONS' })
		expect(unknown.status).toBe(404)
		const preflight = await fetch(`${url}/things`, {
			method: 'OPTIONS',
			headers: { origin, 'access-control-request-method': 'GET' },
		})
		expect(preflight.status).toBe(204)
	})

	it('reaches a response whose headers are immutable', async () => {
		const origin = 'https://app.example.com'
		const { url } = await server({ port: 0, routes: [notes], cors: [origin] })
		const moved = await fetch(`${url}/moved`, {
			redirect: 'manual',
			headers: { origin },
		})
		expect(moved.status).toBe(301)
		expect(moved.headers.get('access-control-allow-origin')).toBe(origin)
		expect(moved.headers.get('access-control-allow-credentials')).toBe('true')
		expect(moved.headers.get('vary')).toBe('Origin')
		expect(moved.headers.get('cache-control')).toBe('no-store')
	})

	it('adds to the vary a route says', async () => {
		const own = routes().get('/varied', (c) => {
			c.header('vary', 'Accept')
			return c.text('varied')
		})
		const { url } = await server({ port: 0, routes: [own] })
		const varied = await fetch(`${url}/varied`)
		expect(varied.headers.get('vary')).toBe('Accept, Origin')
	})
})

const forms = routes()
	.get('/form', (c) => c.text('read'))
	.post('/form', (c) => c.text('sent'))
const posted = async (url: string, headers: Record<string, string>) =>
	fetch(`${url}/form`, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			...headers,
		},
		body: 'text=hi',
	})

describe('a form from another origin', () => {
	it('is refused when it carries cookies or comes from a browser', async () => {
		const { url } = await server({ port: 0, routes: [forms] })
		const cookie = 'session=token'
		const foreign = await posted(url, {
			cookie,
			origin: 'https://evil.example.com',
		})
		expect(foreign.status).toBe(403)
		expect(await foreign.json()).toEqual({
			code: 'ACCESS_DENIED',
			message: 'A form from another origin is refused.',
		})
		// Without cookies, the form would sign its visitor in to the
		// sender's account; `null` is a sandboxed page's origin.
		for (const headers of [
			{ origin: 'https://evil.example.com' },
			{ 'sec-fetch-site': 'cross-site' },
			{ origin: 'null' },
		]) {
			const signIn = await fetch(`${url}/form`, {
				method: 'POST',
				headers: { 'content-type': 'text/plain', ...headers },
				body: '{"email":"mallory@example.com","password":"secret"}',
			})
			expect(signIn.status).toBe(403)
		}
		// A sibling subdomain is the same site, not the same origin.
		const sibling = await posted(url, { cookie, 'sec-fetch-site': 'same-site' })
		expect(sibling.status).toBe(403)
		const plain = await fetch(`${url}/form`, {
			method: 'POST',
			headers: { cookie },
		})
		expect(plain.status).toBe(403)
	})

	it('passes from its own origin, an allowed one, or from a server', async () => {
		const { url } = await server({
			port: 0,
			routes: [forms],
			cors: ['https://app.example.com'],
		})
		const cookie = 'session=token'
		const passed = [
			{ cookie, origin: url },
			{ cookie, 'sec-fetch-site': 'same-origin' },
			{ cookie, origin: 'https://app.example.com' },
			{ cookie, origin: 'http://localhost:5173' },
			{ origin: url },
			{ 'sec-fetch-site': 'same-origin' },
			// A webhook.
			{},
		]
		for (const headers of passed) {
			expect(await (await posted(url, headers)).text()).toBe('sent')
		}
		const json = await fetch(`${url}/form`, {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: '{}',
		})
		expect(await json.text()).toBe('sent')
		const read = await fetch(`${url}/form`, {
			headers: { cookie, origin: 'https://evil.example.com' },
		})
		expect(await read.text()).toBe('read')
	})

	it('passes from its own host over HTTPS, as a proxy forwards it', async () => {
		const { url } = await server({ port: 0, routes: [forms] })
		const cookie = 'session=token'
		// The proxy serves HTTPS and forwards over HTTP (D-223).
		const secure = await posted(url, {
			cookie,
			origin: url.replace('http:', 'https:'),
		})
		expect(await secure.text()).toBe('sent')
	})
})

describe('the body limit and the drain', () => {
	it('are whole numbers, the body limit above 0', () => {
		expect(bodyLimitOf(undefined)).toBe(1024 * 1024)
		expect(bodyLimitOf(10)).toBe(10)
		expect(drainOf(0)).toBe(0)
		expect(drainOf(100)).toBe(100)
		process.env['NODE_ENV'] = 'production'
		expect(drainOf(undefined)).toBe(5000)
		process.env['NODE_ENV'] = 'test'
		expect(drainOf(undefined)).toBe(0)
	})

	it('refuse the start otherwise', async () => {
		// `NaN` and `Infinity` lifted the limit, and skipped the drain (D-223).
		for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1.5]) {
			expect(() => bodyLimitOf(value)).toThrow(
				`bodyLimit is ${value}, not a whole number of bytes above 0.`,
			)
		}
		for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
			expect(() => drainOf(value)).toThrow(
				`drain is ${value}, not a whole number of milliseconds.`,
			)
		}
		for (const options of [{ bodyLimit: Number.NaN }, { drain: -1 }]) {
			const app = defineApp({
				database: memory(),
				plugins: [httpPlugin({ port: 0, ...options })],
				models: [],
				logger: recorder([]),
			})
			// An application that started anyway stops, for the next tests.
			const starting = app.start().then(async () => app.stop())
			await expect(starting).rejects.toThrow('not a whole number')
		}
	})
})

describe('the port', () => {
	it('is the option, then PORT, then 3000', () => {
		delete process.env['PORT']
		expect(portOf(undefined)).toBe(3000)
		process.env['PORT'] = ''
		expect(portOf(undefined)).toBe(3000)
		process.env['PORT'] = '4000'
		expect(portOf(undefined)).toBe(4000)
		expect(portOf(5000)).toBe(5000)
	})

	it('refuses what is not a port', () => {
		process.env['PORT'] = 'eighty'
		expect(() => portOf(undefined)).toThrow(
			'PORT is eighty, not a port between 0 and 65535.',
		)
		for (const value of ['  ', '0x1F90', '1e3', '8080.0', '-0']) {
			process.env['PORT'] = value
			expect(() => portOf(undefined)).toThrow(`PORT is ${value}, not a port`)
		}
		expect(() => portOf(70_000)).toThrow(
			'port is 70000, not a port between 0 and 65535.',
		)
	})

	it('queues more connections than Node does by default (D-276)', async () => {
		const queued = createServer()
		const listen = vi.spyOn(queued, 'listen')
		const port = await listeningOn(queued, 0)
		expect(port).toBeGreaterThan(0)
		expect(listen.mock.calls[0]?.[0]).toMatchObject({
			port: 0,
			backlog: 4096,
		})
		await new Promise((done) => queued.close(done))
	})

	it('names a port in use', async () => {
		const holder = createServer()
		await new Promise<void>((done) => holder.listen(0, done))
		const address = holder.address()
		const port =
			typeof address === 'object' && address !== null ? address.port : 0
		try {
			const taken = defineApp({
				database: memory(),
				plugins: [httpPlugin({ port })],
				models: [],
				logger: recorder([]),
			})
			await expect(taken.start()).rejects.toThrow(
				`Port ${port} is in use: stop the process that holds it, or set PORT.`,
			)
		} finally {
			holder.close()
		}
	})

	it('names a port a server listens on the same way', async () => {
		const holder = createServer()
		const port = await listeningOn(holder, 0)
		await expect(listeningOn(createServer(), port)).rejects.toThrow(
			`Port ${port} is in use: stop the process that holds it, or set PORT.`,
		)
		// The first one still answers, alone on its port.
		holder.on('request', (_, response) => response.end('held'))
		expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe('held')
		await closed(holder, recorder([]), new Map())
	})

	it.runIf(process.platform === 'linux')(
		'accepts several connections in a turn of the event loop',
		async () => {
			const queued = createServer()
			const port = await listeningOn(queued, 0)
			let turn = 0
			const accepted = new Map<number, number>()
			queued.on('connection', () => {
				accepted.set(turn, (accepted.get(turn) ?? 0) + 1)
			})
			let turning = setImmediate(function next() {
				turn += 1
				turning = setImmediate(next)
			})
			const clients = Array.from({ length: 64 }, () =>
				connect(port, '127.0.0.1'),
			)
			const total = () => [...accepted.values()].reduce((a, b) => a + b, 0)
			await expect.poll(total).toBe(64)
			clearImmediate(turning)
			expect(Math.max(...accepted.values())).toBeGreaterThan(1)
			for (const client of clients) client.destroy()
			await closed(queued, recorder([]), new Map())
		},
	)
})

describe('stop', () => {
	it('waits for the requests running on every connection', async () => {
		let running = 0
		let release: (() => void) | undefined
		const released = new Promise<void>((done) => {
			release = done
		})
		const slow = routes()
		slow.get('/slow', async (c) => {
			running += 1
			await released
			return c.text('done')
		})
		const { app, url } = await started({ port: 0, routes: [slow] })
		const requests = Array.from({ length: 64 }, async () => {
			const response = await fetch(`${url}/slow`)
			return response.text()
		})
		await expect.poll(() => running).toBe(64)
		let stopped = false
		const stopping = (async () => {
			await app.stop()
			stopped = true
		})()
		await new Promise((done) => setTimeout(done, 50))
		expect(stopped).toBe(false)
		release?.()
		expect(new Set(await Promise.all(requests))).toEqual(new Set(['done']))
		await stopping
	})

	it('waits for a running request, then refuses new connections', async () => {
		let release: (() => void) | undefined
		const slow = routes()
		slow.get('/slow', async (c) => {
			await new Promise<void>((done) => {
				release = done
			})
			return c.text('done')
		})
		const { app, url } = await started({ port: 0, routes: [slow] })
		// A keep-alive connection, idle when the application stops.
		await fetch(`${url}/nowhere`).then((response) => response.text())
		const running = fetch(`${url}/slow`)
		await expect.poll(() => release).toBeDefined()
		let stopped = false
		const stopping = (async () => {
			await app.stop()
			stopped = true
		})()
		await new Promise((done) => setTimeout(done, 50))
		expect(stopped).toBe(false)
		release?.()
		const released = Date.now()
		expect(await (await running).text()).toBe('done')
		await stopping
		// Its connection, idle after it, closes now, not at the client's timeout.
		expect(Date.now() - released).toBeLessThan(1000)
		await expect(fetch(`${url}/caller`)).rejects.toThrow('fetch failed')
	})
	it('closes a stream still open 10 seconds after stop, and says so', async () => {
		const events = routes()
		events.get('/events', (c) =>
			streamSSE(c, async (stream) => {
				await stream.writeSSE({ data: 'tick' })
				await new Promise<void>((done) => {
					stream.onAbort(done)
				})
			}),
		)
		const { app, lines, url } = await started({ port: 0, routes: [events] })
		const response = await fetch(`${url}/events`)
		await response.body?.getReader().read()
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		try {
			let stopped = false
			const stopping = (async () => {
				await app.stop()
				stopped = true
			})()
			await vi.advanceTimersByTimeAsync(9999)
			expect(stopped).toBe(false)
			await vi.advanceTimersByTimeAsync(1)
			await stopping
		} finally {
			vi.useRealTimers()
		}
		expect(lines).toContainEqual({
			level: 'warn',
			first:
				'Stopped 10 s after stop began: closed the requests still running.',
		})
	})
})

describe('a function’s client (D-113)', () => {
	const signing = routes()
	signing.get('/address', (c) => c.text(clientOf(c).client.address))
	signing.post('/sign', (c) => {
		const { client, sent } = clientOf(c)
		client.cookies.set('session', 'token', { httpOnly: true, maxAge: 60 })
		client.cookies.clear('theme', { path: '/app' })
		// A Response of its own, as `graphql-http` returns.
		return sent(new Response('signed', { status: 201 }))
	})
	signing.post('/none', (c) => {
		const response = new Response('none')
		return clientOf(c).sent(response) === response
			? c.text('same')
			: c.text('copied')
	})

	it('holds the connection’s address', async () => {
		const { url } = await server({ port: 0, routes: [signing] })
		const address = await (await fetch(`${url}/address`)).text()
		expect(['127.0.0.1', '::1', '::ffff:127.0.0.1']).toContain(address)
		expect(await (await signing.request('/address')).text()).toBe('')
	})

	it('adds the cookies its run set to the response', async () => {
		const { url } = await server({ port: 0, routes: [signing] })
		const signed = await fetch(`${url}/sign`, { method: 'POST' })
		expect(signed.status).toBe(201)
		expect(await signed.text()).toBe('signed')
		expect(signed.headers.getSetCookie()).toStrictEqual([
			'session=token; Max-Age=60; Path=/; HttpOnly',
			'theme=; Max-Age=0; Path=/app',
		])
		const none = await fetch(`${url}/none`, { method: 'POST' })
		expect(await none.text()).toBe('same')
	})
})

const reading = routes().get('/address', (c) => c.text(c.var.address))
const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1']

async function addressOf(url: string, forwarded?: string): Promise<string> {
	const headers: Record<string, string> =
		forwarded === undefined ? {} : { 'x-forwarded-for': forwarded }
	return (await fetch(`${url}/address`, { headers })).text()
}

/** A Node request's `env` from `connection`, with these headers. */
function forwardedFrom(connection: string | undefined, headers: string[]) {
	const socket = new Socket()
	Object.defineProperty(socket, 'remoteAddress', { value: connection })
	const incoming = new IncomingMessage(socket)
	incoming.headersDistinct = { 'x-forwarded-for': headers }
	return { incoming }
}

/** Whether a forwarded request from `connection` warns, without proxies. */
function warnedFor(connection: string | undefined): boolean {
	const lines: Line[] = []
	const read = addresses(0, recorder(lines))
	expect(read(forwardedFrom(connection, ['198.51.100.1']))).toBe(
		connection ?? '',
	)
	return lines.length === 1
}

describe('a client’s address behind proxies (D-116)', () => {
	it('is the entry the proxies appended, counted from the right', async () => {
		const { url } = await server({ port: 0, proxies: 1, routes: [reading] })
		expect(await addressOf(url, '6.6.6.6, 203.0.113.7')).toBe('203.0.113.7')
	})

	it('is the connection’s when fewer entries than proxies are sent', async () => {
		const { url } = await server({ port: 0, proxies: 2, routes: [reading] })
		expect(await addressOf(url, '6.6.6.6, 203.0.113.7')).toBe('6.6.6.6')
		expect(await addressOf(url, ' 2001:db8::1 ,10.0.0.1')).toBe('2001:db8::1')
		// A client that went around the proxies wrote this entry itself.
		expect(loopback).toContain(await addressOf(url, '203.0.113.7'))
		expect(loopback).toContain(await addressOf(url))
	})

	it('is the connection’s when the entry is not an address', async () => {
		const { url } = await server({ port: 0, proxies: 2, routes: [reading] })
		expect(loopback).toContain(await addressOf(url, 'unknown, 10.0.0.1'))
		expect(loopback).toContain(
			await addressOf(url, '203.0.113.7:4711, 10.0.0.1'),
		)
	})

	it('ignores the header without proxies, and warns once', async () => {
		const { url, lines } = await server({ port: 0, routes: [reading] })
		const warnings = () => lines.filter((line) => line.level === 'warn')
		expect(loopback).toContain(await addressOf(url))
		expect(warnings()).toStrictEqual([])
		const address = await addressOf(url, '203.0.113.7')
		expect(loopback).toContain(address)
		expect(loopback).toContain(await addressOf(url, '203.0.113.8'))
		expect(warnings()).toStrictEqual([
			{
				level: 'warn',
				first: `A request came through a proxy (X-Forwarded-For) but httpPlugin({ proxies }) is not set: every client counts as ${address}. Set it to the number of proxies in front of the server.`,
			},
		])
	})

	it('warns only for a loopback or private connection', () => {
		const nearby = [
			'127.0.0.2',
			'10.1.2.3',
			'172.31.0.1',
			'192.168.1.1',
			'100.127.0.1',
			'::1',
			'fd00::1',
			'fe80::1',
			'::ffff:10.0.0.1',
		]
		const away = [
			'203.0.113.7',
			'172.15.255.255',
			'172.32.0.1',
			'100.63.255.255',
			'100.128.0.1',
			'2001:db8::1',
			'fec0::1',
			'ff02::1',
		]
		expect(nearby.filter((each) => !warnedFor(each))).toStrictEqual([])
		expect([...away, undefined].filter(warnedFor)).toStrictEqual([])
	})

	it('reads several headers as one list', () => {
		const env = forwardedFrom('10.0.0.2', ['6.6.6.6', '203.0.113.7, 10.0.0.1'])
		expect(addresses(2, recorder([]))(env)).toBe('203.0.113.7')
		expect(addresses(3, recorder([]))(env)).toBe('6.6.6.6')
	})

	it('stops startup when proxies is not a whole number', async () => {
		for (const proxies of [-1, 1.5, Number.NaN]) {
			await expect(started({ port: 0, proxies })).rejects.toThrow(
				`proxies is ${proxies}, not a whole number of proxies in front of the server.`,
			)
		}
	})
})

const reset = async (url: string, key?: string) =>
	fetch(`${url}/_ultimabase/reset`, {
		method: 'POST',
		headers: key === undefined ? {} : { 'x-ultimabase-master-key': key },
	})

describe('the reset route (D-188)', () => {
	it('empties the database for the master key, outside production', async () => {
		const { url } = await server()
		await Note.create({ data: { text: 'a' } }, { as: root })
		const emptied = await reset(url, 'secret')
		expect(emptied.status).toBe(204)
		expect(await emptied.text()).toBe('')
		expect(await Note.count({}, { as: root })).toBe(0)
	})

	it('refuses another caller', async () => {
		const { url } = await server()
		await Note.create({ data: { text: 'a' } }, { as: root })
		const refused = await reset(url)
		expect(refused.status).toBe(403)
		expect(await refused.json()).toMatchObject({ code: 'ACCESS_DENIED' })
		expect(await Note.count({}, { as: root })).toBe(1)
	})

	it('does not exist in production', async () => {
		process.env['NODE_ENV'] = 'production'
		const { url } = await server()
		const missing = await reset(url)
		expect(missing.status).toBe(404)
		expect(await missing.json()).toMatchObject({ code: 'NOT_FOUND' })
	})
})
