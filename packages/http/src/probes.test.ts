// `GET /health` and `GET /ready` (D-204): served before every route, `/ready`
// once started and until the stop, with the plugins' checks, and the drain.
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
		const began = performance.now()
		const stopping = app.stop()
		expect(await answer(await fetch(`${url}/ready`))).toEqual(
			unavailable('The application is stopping.'),
		)
		expect(await answer(await fetch(`${url}/health`))).toEqual(ok)
		await stopping
		running = undefined
		expect(performance.now() - began).toBeGreaterThanOrEqual(95)
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
