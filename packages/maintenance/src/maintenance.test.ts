// Maintenance (D-205) on `memory()`: Master turns it on and off, every other
// request and upgrade meets 503 `MAINTENANCE`, the sockets open close with
// 1012, and the server follows the stored row.
import { connect } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import type { Http } from '@ultimabase/http'
import { httpPlugin, routes } from '@ultimabase/http'
import { testApplication } from '@ultimabase/testing'
import type { Adapter, Feed, Logger, PluginTypes } from 'ultimabase'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { Maintenance, MaintenanceApi } from './index.ts'
import { maintenancePlugin } from './index.ts'
import { MaintenanceState } from './state.ts'

interface Watching extends PluginTypes {
	readonly name: 'watching'
	readonly requires: Http | Maintenance
}

/** The maintenance API, and the close codes `/live`'s sockets received. */
let api: MaintenanceApi | undefined
const closes: (readonly [number, string])[] = []
const watching = definePlugin<Watching>({
	name: 'watching',
	manifest: {
		name: 'watching',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { http: httpPlugin, maintenance: maintenancePlugin },
	api: ({ plugins }) => {
		api = plugins.maintenance
		plugins.http.upgrade(
			'/live',
			({ socket }) => {
				socket.end('HTTP/1.1 101 Switching Protocols\r\n\r\n')
			},
			{ close: (code, reason) => closes.push([code, reason]) },
		)
	},
})

const errors: unknown[] = []
const logger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: (first) => {
		errors.push(first)
	},
	child: () => logger,
}

/**
 * `memory()`, whose rows outlive a restart, whose reads fail while `down`,
 * and whose `missed()` tells the running application changes were lost.
 */
let down = false
function kept(): Adapter & { readonly missed: () => void } {
	const base = memory()
	let feed: Feed | undefined
	let once = false
	return {
		...base,
		start: async (schema, given, next) => {
			feed = next
			if (once) return
			once = true
			await base.start(schema, given, {
				changed: (changes) => feed?.changed(changes),
				missed: () => feed?.missed(),
			})
		},
		find: (read) =>
			down
				? Promise.reject(new Error('The database is down.'))
				: base.find(read),
		missed: () => feed?.missed(),
	}
}

const notes = routes().get('/notes', (c) => c.json([]))
const app = defineApp({
	database: memory(),
	plugins: [
		httpPlugin({ routes: [notes] }),
		maintenancePlugin({ retryAfter: 90_500 }),
		watching.plugin(),
	],
	models: [],
	masterKey: 'secret',
	logger,
})

/** The maintenance API of the running application. */
function maintenance(): MaintenanceApi {
	if (api === undefined) throw new Error('No api.')
	return api
}

const asMaster = { 'x-ultimabase-master-key': 'secret' }

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

describe('the maintenance', () => {
	const running = testApplication(app)
	const switched = (enabled: unknown, headers: object = asMaster) =>
		fetch(`${running.url}/_ultimabase/maintenance`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify({ enabled }),
		})

	it('is off at first', async () => {
		expect(maintenance().locked()).toBe(false)
		expect((await fetch(`${running.url}/notes`)).status).toBe(200)
	})

	it('answers 503 with Retry-After while on, then serves again', async () => {
		const on = await switched(true)
		expect(on.status).toBe(200)
		expect(await on.json()).toEqual({ enabled: true })
		const refused = await fetch(`${running.url}/notes`)
		expect(refused.status).toBe(503)
		expect(refused.headers.get('retry-after')).toBe('91')
		expect(await refused.json()).toEqual({
			code: 'MAINTENANCE',
			message: 'The application is under maintenance.',
			details: { retryAfter: 91 },
		})
		expect((await fetch(`${running.url}/health`)).status).toBe(200)
		expect((await fetch(`${running.url}/ready`)).status).toBe(200)
		expect(await (await switched(false)).json()).toEqual({ enabled: false })
		expect((await fetch(`${running.url}/notes`)).status).toBe(200)
	})

	it('lets Master through', async () => {
		await maintenance().lock()
		const response = await fetch(`${running.url}/notes`, { headers: asMaster })
		expect(response.status).toBe(200)
		const wrong = { 'x-ultimabase-master-key': 'wrong' }
		expect(
			(await fetch(`${running.url}/notes`, { headers: wrong })).status,
		).toBe(503)
	})

	it('is switched by Master only, with { enabled }', async () => {
		const anonymous = await switched(true, {})
		expect(anonymous.status).toBe(403)
		expect(await anonymous.json()).toEqual({
			code: 'ACCESS_DENIED',
			message: 'Only the master key turns the maintenance on or off.',
		})
		const wrong = await switched('yes')
		expect(wrong.status).toBe(400)
		expect(await wrong.json()).toEqual({
			code: 'VALIDATION_FAILED',
			message: 'The body is { "enabled": true } or { "enabled": false }.',
		})
		const empty = await fetch(`${running.url}/_ultimabase/maintenance`, {
			method: 'PUT',
			headers: asMaster,
			body: 'null',
		})
		expect(empty.status).toBe(400)
		expect(maintenance().locked()).toBe(false)
	})

	it('refuses the upgrades, and closes the open sockets once', async () => {
		closes.length = 0
		expect(await upgrade(running.url, '/live')).toBe(
			'HTTP/1.1 101 Switching Protocols',
		)
		await maintenance().lock()
		await maintenance().lock()
		expect(closes).toEqual([[1012, 'Maintenance']])
		expect(await upgrade(running.url, '/live')).toBe(
			'HTTP/1.1 503 Service Unavailable',
		)
		await maintenance().unlock()
		expect(await upgrade(running.url, '/live')).toBe(
			'HTTP/1.1 101 Switching Protocols',
		)
	})

	it('stores its state, as another server reads it', async () => {
		await maintenance().lock()
		const row = await MaintenanceState.findUnique(
			{ where: { key: 'state' } },
			{ as: master },
		)
		expect(row?.enabled).toBe(true)
	})

	it('follows a change another server stored', async () => {
		await MaintenanceState.create(
			{ data: { key: 'state', enabled: true } },
			{ as: master },
		)
		await vi.waitFor(() => expect(maintenance().locked()).toBe(true))
	})

	it('reads the row again after lost changes', async () => {
		await maintenance().lock()
		running.feed.missed()
		await turn()
		expect(maintenance().locked()).toBe(true)
	})
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ title: f.string() }),
})
/** The change feed's next turn. */
const turn = () => new Promise((resolve) => setImmediate(resolve))

/** Starts the application on `database`, which outlives its stops. */
async function started(database: Adapter) {
	const application = defineApp({
		database,
		plugins: [
			httpPlugin({ port: 0, drain: 0 }),
			maintenancePlugin(),
			watching.plugin(),
		],
		models: [Note],
		logger,
	})
	await application.start()
	return application
}

// On a database the test keeps, as testApplication gives each test its own.
describe('its stored row', () => {
	it('gives a new start its state', async () => {
		const application = await started(kept())
		await maintenance().lock()
		await application.stop()
		await application.start()
		expect(maintenance().locked()).toBe(true)
		await application.stop()
	})

	it('reads its row for its own changes only', async () => {
		const application = await started(kept())
		await turn()
		errors.length = 0
		down = true
		try {
			await Note.create({ data: { title: 'A' } }, { as: master })
			await turn()
			expect(errors).toEqual([])
		} finally {
			down = false
			await application.stop()
		}
	})

	it('keeps the state as it was when it cannot read the row', async () => {
		const database = kept()
		const application = await started(database)
		await maintenance().lock()
		// The lock's own change reaches the feed on the next turn.
		await turn()
		errors.length = 0
		down = true
		try {
			database.missed()
			await vi.waitFor(() => expect(errors).toHaveLength(1))
			expect(maintenance().locked()).toBe(true)
		} finally {
			down = false
			await application.stop()
		}
	})
})
