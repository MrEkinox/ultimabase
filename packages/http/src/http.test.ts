// `httpPlugin()` (D-66, D-106): routes that read the caller, errors as D-72
// sends them, CORS, the body limit, the port, the client's address behind
// proxies (D-116) and a stop that waits, 10 s at most.
import { createServer, IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { streamSSE } from 'hono/streaming'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Logger, PluginTypes } from 'ultimabase'
import {
	defineApp,
	defineModel,
	definePlugin,
	memory,
	PublicError,
} from 'ultimabase'
import type { HttpApi, Routes } from './index.ts'
import { clientOf, httpPlugin, routes } from './index.ts'
import { addresses } from './address.ts'
import { portOf } from './server.ts'

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

type Mounted = ReturnType<typeof mounting.plugin>

/** A started application on a free port, and what it logged. */
async function started(
	options: Parameters<typeof httpPlugin>[0] = {},
	...others: readonly Mounted[]
) {
	const lines: Line[] = []
	const app = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0, routes: [notes], ...options }), ...others],
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
			"The HTTP server is running: mount routes from your plugin's api (D-107).",
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
})

describe('stop', () => {
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
				first: `A request came through a proxy (X-Forwarded-For) but httpPlugin({ proxies }) is not set: every client counts as ${address}. Set it to the number of proxies in front of the server (D-116).`,
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
				`proxies is ${proxies}, not a whole number of proxies in front of the server (D-116).`,
			)
		}
	})
})
