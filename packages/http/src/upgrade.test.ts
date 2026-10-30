// WebSocket upgrades (D-154): a plugin takes a path's, past the origin check
// CORS makes and the application's gate, `closeUpgrades` closes them (D-166)
// and `stop` closes the sockets it took, 10 s at most.
import { request as send } from 'node:http'
import { connect } from 'node:net'
import type { Duplex } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Logger, PluginTypes } from 'ultimabase'
import { defineApp, definePlugin, memory } from 'ultimabase'
import type { Accept, Gate, HttpApi, Upgrade } from './index.ts'
import { httpPlugin } from './index.ts'

const errors: unknown[] = []
const logger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: (first: string | object) => {
		errors.push(first)
	},
	child: () => logger,
}

interface Http extends PluginTypes {
	readonly name: 'http'
	readonly api: HttpApi
}
interface Sockets extends PluginTypes {
	readonly name: 'sockets'
	readonly requires: Http
}
const taken: Upgrade[] = []
const closes: (readonly [number, string])[] = []
let late: HttpApi | undefined
/** Switches protocols, and closes its socket when the client leaves. */
const switching: Accept = (upgrade) => {
	taken.push(upgrade)
	// A client that leaves closes its socket, as ws does.
	upgrade.socket.once('end', () => upgrade.socket.end())
	upgrade.socket.write(
		'HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\n',
	)
}
/**
 * Takes `/live`'s upgrades, those of `/closing`, whose sockets it closes
 * itself, and fails those of `/broken`.
 */
const sockets = definePlugin<Sockets>({
	name: 'sockets',
	manifest: {
		name: 'sockets',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { http: httpPlugin },
	api: ({ plugins }) => {
		late = plugins.http
		plugins.http.upgrade('/live', switching)
		plugins.http.upgrade('/closing', switching, {
			close: (code, reason) => {
				closes.push([code, reason])
			},
		})
		// Before the server starts, there is nothing to close.
		plugins.http.closeUpgrades({ code: 1012 })
		plugins.http.upgrade('/broken', () => {
			throw new Error('broken')
		})
	},
})

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	taken.length = 0
	closes.length = 0
	errors.length = 0
	await stop?.()
	stop = undefined
})

async function started(upgrade?: Gate) {
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({
				port: 0,
				cors: ['https://app.example.com'],
				...(upgrade && { upgrade }),
			}),
			sockets.plugin(),
		],
		models: [],
		logger,
	})
	await app.start()
	stop = async () => app.stop()
	return { app, url: late?.url() ?? '' }
}

type Answer = {
	readonly status: number | undefined
	readonly body?: unknown
	readonly socket?: Duplex
}

/** Asks `url` for a WebSocket upgrade. */
async function upgraded(
	url: string,
	headers: Record<string, string> = {},
): Promise<Answer> {
	return new Promise((done, fail) => {
		const asked = send(url, {
			headers: { connection: 'Upgrade', upgrade: 'websocket', ...headers },
		})
		asked.on('upgrade', (response, socket) => {
			done({ status: response.statusCode, socket })
		})
		asked.on('response', (response) => {
			let text = ''
			response.setEncoding('utf8')
			response.on('data', (chunk: string) => {
				text += chunk
			})
			response.on('end', () => {
				const body: unknown = JSON.parse(text)
				done({ status: response.statusCode, body })
			})
		})
		asked.on('error', fail)
		asked.end()
	})
}

/** The whole answer to an upgrade of `target`, as the server wrote it. */
async function raw(url: string, target: string): Promise<string> {
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
		socket.on('end', () => done(text))
	})
}

describe('an upgrade', () => {
	it('goes to its path’s plugin, with the request identify reads', async () => {
		const { url } = await started()
		const answer = await upgraded(`${url}/live?x=1`, {
			cookie: 'session=abc',
			origin: 'https://app.example.com',
		})
		expect(answer.status).toBe(101)
		answer.socket?.destroy()
		const [first] = taken
		expect(first?.request.url).toBe(`${url}/live?x=1`)
		expect(first?.request.headers.get('cookie')).toBe('session=abc')
		expect(first?.incoming.url).toBe('/live?x=1')
		expect(first?.head).toBeInstanceOf(Buffer)
		expect(['127.0.0.1', '::1', '::ffff:127.0.0.1']).toContain(first?.address)
	})

	it('comes from the server’s origin, one CORS allows, or no browser', async () => {
		const { url } = await started()
		for (const origin of [url, 'http://localhost:5173', undefined]) {
			const headers = origin === undefined ? {} : { origin }
			const answer = await upgraded(`${url}/live`, headers)
			expect(answer.status).toBe(101)
			answer.socket?.destroy()
		}
		expect(taken).toHaveLength(3)
	})

	it('is refused from another origin before its plugin sees it', async () => {
		const { url } = await started()
		for (const origin of ['https://evil.example.com', 'null']) {
			expect(await upgraded(`${url}/live`, { origin })).toEqual({
				status: 403,
				body: {
					code: 'ACCESS_DENIED',
					message: 'A WebSocket from another origin is refused.',
				},
			})
		}
		expect(taken).toEqual([])
	})

	it('is refused on a path no plugin takes, and when its plugin fails', async () => {
		const { url } = await started()
		expect(await upgraded(`${url}/graphql`)).toEqual({
			status: 404,
			body: { code: 'NOT_FOUND', message: 'No upgrade at /graphql.' },
		})
		expect(await upgraded(`${url}/broken`)).toEqual({
			status: 500,
			body: { code: 'INTERNAL', message: 'Internal error.' },
		})
		expect(errors).toEqual([{ err: new Error('broken') }])
	})

	it('is refused without a path', async () => {
		const { url } = await started()
		const answer = await raw(url, 'http://localhost/live')
		expect(answer).toMatch(/^HTTP\/1\.1 400 Bad Request\r\n/)
		expect(answer).toContain('"code":"BAD_REQUEST"')
	})
})

describe('the gate', () => {
	it('sends its response as it is, before the plugin sees the upgrade', async () => {
		const gated: Request[] = []
		const { url } = await started(async (request) => {
			gated.push(request)
			return Response.json(
				{ code: 'UNAVAILABLE', message: 'Under maintenance.' },
				{ status: 503, headers: { 'retry-after': '30' } },
			)
		})
		const answer = await raw(url, '/live?x=1')
		expect(answer).toMatch(/^HTTP\/1\.1 503 Service Unavailable\r\n/)
		expect(answer).toContain('\r\nretry-after: 30\r\n')
		expect(answer).toContain('\r\nconnection: close\r\n')
		expect(answer).toMatch(
			/\r\n\r\n\{"code":"UNAVAILABLE","message":"Under maintenance\."\}$/,
		)
		expect(gated.map((request) => request.url)).toEqual([
			'http://localhost/live?x=1',
		])
		expect(taken).toEqual([])
	})

	it('lets an upgrade through with nothing', async () => {
		const { url } = await started(() => undefined)
		const answer = await upgraded(`${url}/live`)
		expect(answer.status).toBe(101)
		answer.socket?.destroy()
		expect(taken).toHaveLength(1)
	})

	it('that fails is logged, and the upgrade refused', async () => {
		const { url } = await started(() => {
			throw new Error('gate')
		})
		expect(await upgraded(`${url}/live`)).toEqual({
			status: 500,
			body: { code: 'INTERNAL', message: 'Internal error.' },
		})
		expect(errors).toEqual([{ err: new Error('gate') }])
		expect(taken).toEqual([])
	})
})

describe('closeUpgrades', () => {
	it('closes each path with its plugin’s close, and cuts the others', async () => {
		const { url } = await started()
		const live = await upgraded(`${url}/live`)
		const closing = await upgraded(`${url}/closing`)
		const cut = new Promise((done) => live.socket?.once('close', done))
		late?.closeUpgrades({ code: 1012, reason: 'Maintenance' })
		expect(closes).toEqual([[1012, 'Maintenance']])
		await cut
		expect(closing.socket?.destroyed).toBe(false)
		closing.socket?.destroy()
	})

	it('closes the sockets of one path alone', async () => {
		const { url } = await started()
		const live = await upgraded(`${url}/live`)
		late?.closeUpgrades({ code: 1012, path: '/closing' })
		expect(closes).toEqual([[1012, '']])
		const cut = new Promise((done) => live.socket?.once('close', done))
		late?.closeUpgrades({ code: 1012, path: '/live' })
		await cut
		expect(() => late?.closeUpgrades({ code: 1012, path: '/other' })).toThrow(
			'No plugin takes the upgrades of /other.',
		)
	})

	it('closes nothing once the server stopped', async () => {
		await started()
		await stop?.()
		stop = undefined
		late?.closeUpgrades({ code: 1012 })
		expect(closes).toEqual([])
	})
})

describe('the upgrades', () => {
	it('are taken from a plugin’s api, one plugin a path', async () => {
		await started()
		expect(() => late?.upgrade('/other', () => undefined)).toThrow(
			"The HTTP server is running: take upgrades from your plugin's api.",
		)
		await stop?.()
		stop = undefined
		const twice = definePlugin<Sockets>({
			name: 'sockets',
			manifest: {
				name: 'sockets',
				version: '1.0.0',
				peerDependencies: { ultimabase: '*' },
			},
			requires: { http: httpPlugin },
			api: ({ plugins }) => {
				plugins.http.upgrade('/live', () => undefined)
				plugins.http.upgrade('/live', () => undefined)
			},
		})
		const app = defineApp({
			database: memory(),
			plugins: [httpPlugin({ port: 0 }), twice.plugin()],
			models: [],
			logger,
		})
		await expect(app.start()).rejects.toThrow(
			'Two plugins take the upgrades of /live.',
		)
	})

	it('still open 10 seconds after stop are closed', async () => {
		const { app, url } = await started()
		const answer = await upgraded(`${url}/live`)
		const closing = new Promise((done) => answer.socket?.once('close', done))
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
		await closing
	})
})
