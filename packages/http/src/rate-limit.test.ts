// The limit on each client address's requests (D-218): counted before the
// gates and the caller, per public address, an IPv6 one by its /64, upgrades
// included; Master passes.
import { connect } from 'node:net'
import type { Logger, PluginTypes } from 'ultimabase'
import { defineApp, definePlugin, memory } from 'ultimabase'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Http, HttpApi, HttpOptions } from './index.ts'
import { httpPlugin, routes } from './index.ts'
import { limiter } from './limit.ts'

interface Taking extends PluginTypes {
	readonly name: 'taking'
	readonly requires: Http
}
let http: HttpApi | undefined
const taking = definePlugin<Taking>({
	name: 'taking',
	manifest: {
		name: 'taking',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { http: httpPlugin },
	api: ({ plugins }) => {
		http = plugins.http
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

const warned: string[] = []
const logger: Logger = {
	info: () => undefined,
	warn: (first: string | object) => {
		if (typeof first === 'string') warned.push(first)
	},
	error: () => undefined,
	child: () => logger,
}

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
	identified = 0
	warned.length = 0
	vi.useRealTimers()
})

/** A server behind one proxy, which forwards each client's address. */
async function started(options: HttpOptions = {}) {
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({
				port: 0,
				drain: 0,
				proxies: 1,
				routes: [notes],
				rateLimit: { requests: 2, window: 60_000 },
				...options,
			}),
			taking.plugin(),
		],
		models: [],
		masterKey: 'secret',
		logger,
	})
	await app.start()
	stop = async () => app.stop()
	return http?.url() ?? ''
}

const from = (address: string, headers: Record<string, string> = {}) => ({
	headers: { 'x-forwarded-for': address, ...headers },
})

/** The statuses of `count` requests to `/notes` from `address`. */
async function statuses(
	url: string,
	address: string,
	count: number,
	headers: Record<string, string> = {},
): Promise<number[]> {
	const answers: number[] = []
	for (let sent = 0; sent < count; sent += 1) {
		const response = await fetch(`${url}/notes`, from(address, headers))
		answers.push(response.status)
	}
	return answers
}

/** The first line of the server's answer to an upgrade from `address`. */
async function upgrade(url: string, address: string): Promise<string> {
	const { port } = new URL(url)
	return new Promise<string>((done) => {
		const socket = connect(Number(port), 'localhost', () => {
			socket.write(
				`GET /live HTTP/1.1\r\nhost: localhost\r\nx-forwarded-for: ${address}\r\nconnection: Upgrade\r\nupgrade: websocket\r\n\r\n`,
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

describe('the rate limit', () => {
	it('refuses an address over it, before the caller and the routes', async () => {
		const url = await started()
		expect(await statuses(url, '203.0.113.5', 2)).toEqual([200, 200])
		const response = await fetch(`${url}/notes`, {
			headers: {
				'x-forwarded-for': '203.0.113.5',
				origin: 'http://localhost:5173',
			},
		})
		expect(response.status).toBe(429)
		expect(await response.json()).toEqual({
			code: 'TOO_MANY_ATTEMPTS',
			message: 'Too many requests: try again later.',
			details: { retryAfter: 60 },
		})
		expect(response.headers.get('retry-after')).toBe('60')
		expect(response.headers.get('access-control-allow-origin')).toBe(
			'http://localhost:5173',
		)
		expect(identified).toBe(2)
		await statuses(url, '203.0.113.5', 1)
		expect(warned).toEqual([
			'203.0.113.5 sent over 2 requests in 60000 ms: refused until the window ends.',
		])
	})

	it('counts each address apart, an IPv6 one by its /64', async () => {
		const url = await started()
		expect(await statuses(url, '203.0.113.5', 3)).toEqual([200, 200, 429])
		expect(await statuses(url, '198.51.100.7', 1)).toEqual([200])
		expect(await statuses(url, '2001:db8:1:2::1', 2)).toEqual([200, 200])
		expect(await statuses(url, '2001:db8:1:2::ffff', 1)).toEqual([429])
		expect(await statuses(url, '2001:db8:1:3::1', 1)).toEqual([200])
		expect(await statuses(url, '::ffff:198.51.100.7', 2)).toEqual([200, 429])
	})

	it('never counts a private or local address', async () => {
		const url = await started({ proxies: 0 })
		expect(await statuses(url, '203.0.113.5', 4)).toEqual([200, 200, 200, 200])
	})

	it('lets Master through, not a wrong key', async () => {
		const url = await started()
		const master = { 'x-ultimabase-master-key': 'secret' }
		expect(await statuses(url, '203.0.113.5', 4, master)).toEqual([
			200, 200, 200, 200,
		])
		const wrong = { 'x-ultimabase-master-key': 'guess' }
		expect(await statuses(url, '203.0.113.5', 1, wrong)).toEqual([429])
	})

	it('counts the upgrades with the requests', async () => {
		const url = await started()
		expect(await upgrade(url, '203.0.113.5')).toBe(
			'HTTP/1.1 101 Switching Protocols',
		)
		await statuses(url, '203.0.113.5', 1)
		expect(await upgrade(url, '203.0.113.5')).toBe(
			'HTTP/1.1 429 Too Many Requests',
		)
	})

	it('is off with false', async () => {
		const url = await started({ rateLimit: false })
		expect(await statuses(url, '203.0.113.5', 4)).toEqual([200, 200, 200, 200])
	})

	it('refuses a limit that is not a whole number above 0', async () => {
		await expect(
			started({ rateLimit: { requests: 0, window: 60_000 } }),
		).rejects.toThrow('rateLimit.requests is 0, not a whole number above 0.')
		await expect(
			started({ rateLimit: { requests: 10, window: 1.5 } }),
		).rejects.toThrow('rateLimit.window is 1.5, not a whole number above 0.')
	})
})

const identify = async () => ({ kind: 'anonymous' }) as const

describe('the limiter', () => {
	const request = new Request('http://localhost/notes')

	it('takes 600 requests a minute by default, then starts again', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		const limit = limiter(undefined, identify, logger)
		for (let sent = 0; sent < 600; sent += 1) {
			expect(await limit(request, '203.0.113.5')).toBeUndefined()
		}
		vi.advanceTimersByTime(59_500)
		expect(await limit(request, '203.0.113.5')).toBe(1)
		vi.advanceTimersByTime(500)
		expect(await limit(request, '203.0.113.5')).toBeUndefined()
	})

	it('never counts a request without an address', async () => {
		const limit = limiter({ requests: 1, window: 60_000 }, identify, logger)
		expect(await limit(request, '')).toBeUndefined()
		expect(await limit(request, '')).toBeUndefined()
	})
})
