// `GET /health` and `GET /ready` (D-204): served before every route, `/ready`
// once started and until the stop, with the plugins' checks, and the drain.
import { connect } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Logger, PluginTypes } from 'ultimabase'
import { defineApp, definePlugin, memory } from 'ultimabase'
import type { HttpApi, HttpOptions, ReadyCheck } from './index.ts'
import { httpPlugin, routes } from './index.ts'

type Line = { readonly level: string; readonly first: unknown }
function recorder(lines: Line[]): Logger {
	const at = (level: string) => (first: string | object) => {
		lines.push({ level, first })
	}
	const logger: Logger = {
		info: at('info'),
		warn: at('warn'),
		error: at('error'),
		child: () => logger,
	}
	return logger
}

const environment = process.env['NODE_ENV']
afterEach(() => {
	process.env['NODE_ENV'] = environment
	vi.useRealTimers()
})

interface Http extends PluginTypes {
	readonly name: 'http'
	readonly api: HttpApi
}
interface Checking extends PluginTypes {
	readonly name: 'checking'
	readonly requires: Http
}

/** Its check, and a `start` that waits for `gate`, `/ready` read meanwhile. */
let check: ReadyCheck = () => true
let gate: Promise<void> = Promise.resolve()
let reached: (url: string) => void = () => undefined
let late: HttpApi | undefined
const checking = definePlugin<Checking>({
	name: 'checking',
	manifest: {
		name: 'checking',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { http: httpPlugin },
	api: ({ plugins }) => {
		late = plugins.http
		plugins.http.ready(async () => check())
		plugins.http.upgrade('/live', ({ socket }) => socket.destroy())
	},
	start: async ({ plugins }) => {
		reached(plugins.http.url())
		await gate
	},
})

function application(options: HttpOptions = {}) {
	const lines: Line[] = []
	const app = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0, ...options }), checking.plugin()],
		models: [],
		masterKey: 'secret',
		logger: recorder(lines),
	})
	return { app, lines }
}

let running: { stop: () => Promise<void> } | undefined
afterEach(async () => {
	await running?.stop()
	running = undefined
	check = () => true
	gate = Promise.resolve()
	reached = () => undefined
})

/** A started application, and its server's address. */
async function started(options?: HttpOptions) {
	const { app, lines } = application(options)
	const { promise, resolve } = Promise.withResolvers<string>()
	reached = resolve
	running = app
	await app.start()
	return { app, lines, url: await promise }
}

const answer = async (response: Response) => ({
	status: response.status,
	body: await response.json(),
})
const unavailable = (message: string) => ({
	status: 503,
	body: { code: 'UNAVAILABLE', message },
})
const ok = { status: 200, body: { status: 'ok' } }

describe('/health', () => {
	it('answers 200 while the application starts, and once started', async () => {
		const { promise, resolve } = Promise.withResolvers<void>()
		gate = promise
		const { app } = application()
		const url = new Promise<string>((done) => {
			reached = done
		})
		running = app
		const starting = app.start()
		expect(await answer(await fetch(`${await url}/health`))).toEqual(ok)
		resolve()
		await starting
		expect(await answer(await fetch(`${await url}/health`))).toEqual(ok)
	})

	it('answers HEAD, without a body', async () => {
		const { url } = await started()
		const response = await fetch(`${url}/health`, { method: 'HEAD' })
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('')
	})

	it('comes before the routes, without CORS or a caller', async () => {
		let identified = 0
		const taken = routes()
			.use(async (_, next) => {
				identified += 1
				await next()
			})
			.get('/health', (c) => c.text('mine'))
		const { url } = await started({ routes: [taken] })
		const response = await fetch(`${url}/health`, {
			headers: { origin: 'http://localhost:5173' },
		})
		expect(await answer(response)).toEqual(ok)
		expect(response.headers.get('access-control-allow-origin')).toBeNull()
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(identified).toBe(0)
	})
})

/** The status line the server answers an upgrade of `target` with. */
async function upgradeStatus(url: string, target: string): Promise<string> {
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

describe('while the application starts', () => {
	it('answers every other request 503, Master’s too, then serves', async () => {
		const { promise, resolve } = Promise.withResolvers<void>()
		gate = promise
		const { app } = application({
			routes: [routes().get('/mine', (c) => c.text('mine'))],
		})
		const url = new Promise<string>((done) => {
			reached = done
		})
		running = app
		const starting = app.start()
		const at = await url
		const starts = unavailable('The application is starting.')
		expect(await answer(await fetch(`${at}/mine`))).toEqual(starts)
		const master = { 'x-ultimabase-master-key': 'secret' }
		expect(
			await answer(await fetch(`${at}/mine`, { headers: master })),
		).toEqual(starts)
		expect(await upgradeStatus(at, '/live')).toBe(
			'HTTP/1.1 503 Service Unavailable',
		)
		resolve()
		await starting
		expect(await (await fetch(`${at}/mine`)).text()).toBe('mine')
	})
})

describe('/ready', () => {
	it('answers 503 until every plugin started, then 200', async () => {
		const { promise, resolve } = Promise.withResolvers<void>()
		gate = promise
		const { app } = application()
		const url = new Promise<string>((done) => {
			reached = done
		})
		running = app
		const starting = app.start()
		expect(await answer(await fetch(`${await url}/ready`))).toEqual(
			unavailable('The application is starting.'),
		)
		resolve()
		await starting
		expect(await answer(await fetch(`${await url}/ready`))).toEqual(ok)
	})

	it('answers 503 while a check fails', async () => {
		const { url } = await started()
		check = () => false
		expect(await answer(await fetch(`${url}/ready`))).toEqual(
			unavailable('A readiness check failed.'),
		)
		check = () => true
		expect(await answer(await fetch(`${url}/ready`))).toEqual(ok)
	})

	it('fails a check that throws, and logs its error', async () => {
		const { url, lines } = await started()
		const error = new Error('No queue.')
		check = () => {
			throw error
		}
		expect(await answer(await fetch(`${url}/ready`))).toEqual(
			unavailable('A readiness check failed.'),
		)
		expect(lines).toContainEqual({ level: 'error', first: { err: error } })
	})

	it('refuses a check added once the server runs', async () => {
		await started()
		expect(() => late?.ready(() => true)).toThrow(
			"The HTTP server is running: add readiness checks from your plugin's api.",
		)
	})
})

describe('the drain', () => {
	it('answers 503 on /ready, serving as before, then stops', async () => {
		const { app, url } = await started({ drain: 100 })
		// The drain ends only when told to: a slow machine cannot outrun the fetches.
		vi.useFakeTimers({ toFake: ['setTimeout'] })
		let stopped = false
		const stopping = (async () => {
			await app.stop()
			stopped = true
		})()
		// Together, on a connection each: with `setTimeout` faked, a fetch reusing an
		// idle connection stalls for 6 s, past the test's timeout.
		const [ready, health] = await Promise.all([
			fetch(`${url}/ready`).then(answer),
			fetch(`${url}/health`).then(answer),
		])
		expect(ready).toEqual(unavailable('The application is stopping.'))
		expect(health).toEqual(ok)
		await vi.advanceTimersByTimeAsync(99)
		expect(stopped).toBe(false)
		await vi.advanceTimersByTimeAsync(1)
		vi.useRealTimers()
		await stopping
		running = undefined
		expect(stopped).toBe(true)
		await expect(fetch(`${url}/health`)).rejects.toThrow('fetch failed')
	})

	it('lasts 5 seconds under NODE_ENV=production', async () => {
		process.env['NODE_ENV'] = 'production'
		const { app } = await started()
		vi.useFakeTimers({ toFake: ['setTimeout'] })
		let stopped = false
		const stopping = (async () => {
			await app.stop()
			stopped = true
		})()
		await vi.advanceTimersByTimeAsync(4999)
		expect(stopped).toBe(false)
		await vi.advanceTimersByTimeAsync(1)
		vi.useRealTimers()
		await stopping
		running = undefined
		expect(stopped).toBe(true)
	})

	it('is none outside production', async () => {
		const { app } = await started()
		vi.useFakeTimers({ toFake: ['setTimeout'] })
		// No timer to advance: a drain would never end.
		await expect(app.stop()).resolves.toBeUndefined()
		running = undefined
	})
})
