// `httpPlugin()` (D-66, D-106): routes that read the caller, errors as D-72
// sends them, CORS, the body limit, the port and a stop that waits.
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { Logger } from 'ultimabase'
import { defineApp, defineModel, memory, PublicError } from 'ultimabase'
import type { Routes } from './index.ts'
import { httpPlugin, routes } from './index.ts'
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

/** A started application on a free port, and what it logged. */
async function started(options: Parameters<typeof httpPlugin>[0] = {}) {
	const lines: Line[] = []
	const app = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0, routes: [notes], ...options })],
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
async function server(options?: Parameters<typeof httpPlugin>[0]) {
	const running = await started(options)
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
	failing.get('/crash', () => {
		throw new Error('Connection refused.')
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
})
