// A plugin's gates (D-205): on each request, past CORS and before the caller
// and the routes, and on each upgrade, past the application's `upgrade`.
import { connect } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { PluginTypes } from 'ultimabase'
import { defineApp, definePlugin, memory } from 'ultimabase'
import type { Gate, Http, HttpApi, HttpOptions } from './index.ts'
import { httpPlugin, routes } from './index.ts'

interface Gating extends PluginTypes {
	readonly name: 'gating'
	readonly requires: Http
}

/** What the plugin's gate answers, and the requests it saw. */
let refusal: Response | undefined
const seen: string[] = []
let late: HttpApi | undefined
const gating = definePlugin<Gating>({
	name: 'gating',
	manifest: {
		name: 'gating',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { http: httpPlugin },
	api: ({ plugins }) => {
		late = plugins.http
		plugins.http.gate((request) => {
			seen.push(new URL(request.url).pathname)
			return refusal?.clone()
		})
		plugins.http.upgrade('/live', ({ socket }) => {
			socket.end('HTTP/1.1 101 Switching Protocols\r\n\r\n')
		})
	},
})

let identified = 0
const notes = routes()
	.use(async (_, next) => {
		identified += 1
		await next()
	})
	.get('/notes', (c) => c.json([]))

let running: { stop: () => Promise<void> } | undefined
afterEach(async () => {
	await running?.stop()
	running = undefined
	refusal = undefined
	seen.length = 0
	identified = 0
})

async function started(options: HttpOptions = {}) {
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0, drain: 0, routes: [notes], ...options }),
			gating.plugin(),
		],
		models: [],
		masterKey: 'secret',
	})
	running = app
	await app.start()
	if (late === undefined) throw new Error('No api.')
	return late.url()
}

const closed = Response.json(
	{ code: 'MAINTENANCE', message: 'Closed.' },
	{ status: 503, headers: { 'retry-after': '60' } },
)

const forbidden: Gate = () => new Response(null, { status: 403 })

/** The first line of the server's answer to an upgrade of `target`. */
async function upgrade(url: string, target: string): Promise<string> {
	const { port } = new URL(url)
	return new Promise<string>((done) => {
		const socket = connect(Number(port), 'localhost', () => {
			socket.write(
				`GET ${target} HTTP/1.1\r\nhost: localhost\r\nconnection: Upgrade\r\nupgrade: websocket\r\n\r\n`,
			)
		})
		let text = ''
		socket.setEncoding('utf8')
		socket.on('data', (chunk: string) => {
			text += chunk
		})
		socket.on('end', () => done(text.split('\r\n')[0] ?? ''))
	})
}

describe('a gate on requests', () => {
	it('lets a request through when it answers undefined', async () => {
		const url = await started()
		const response = await fetch(`${url}/notes`)
		expect(response.status).toBe(200)
		expect(seen).toEqual(['/notes'])
		expect(identified).toBe(1)
	})

	it('refuses before the caller and the routes, with CORS headers', async () => {
		const url = await started()
		refusal = closed
		const response = await fetch(`${url}/notes`, {
			headers: { origin: 'http://localhost:5173' },
		})
		expect(response.status).toBe(503)
		expect(await response.json()).toEqual({
			code: 'MAINTENANCE',
			message: 'Closed.',
		})
		expect(response.headers.get('retry-after')).toBe('60')
		expect(response.headers.get('access-control-allow-origin')).toBe(
			'http://localhost:5173',
		)
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(identified).toBe(0)
	})

	it('leaves the probes and the preflights alone', async () => {
		const url = await started()
		refusal = closed
		expect((await fetch(`${url}/health`)).status).toBe(200)
		expect((await fetch(`${url}/ready`)).status).toBe(200)
		const preflight = await fetch(`${url}/notes`, {
			method: 'OPTIONS',
			headers: {
				origin: 'http://localhost:5173',
				'access-control-request-method': 'POST',
			},
		})
		expect(preflight.status).toBe(204)
		expect(seen).toEqual([])
	})

	it('is refused once the server runs', async () => {
		await started()
		expect(() => late?.gate(() => undefined)).toThrow(
			"The HTTP server is running: add gates from your plugin's api.",
		)
	})
})

describe('a gate on upgrades', () => {
	it('refuses an upgrade with its response', async () => {
		const url = await started()
		expect(await upgrade(url, '/live')).toBe('HTTP/1.1 101 Switching Protocols')
		refusal = closed
		expect(await upgrade(url, '/live')).toBe('HTTP/1.1 503 Service Unavailable')
	})

	it('runs after the application’s upgrade gate', async () => {
		const url = await started({ upgrade: forbidden })
		refusal = closed
		expect(await upgrade(url, '/live')).toBe('HTTP/1.1 403 Forbidden')
		expect(seen).toEqual([])
	})
})
