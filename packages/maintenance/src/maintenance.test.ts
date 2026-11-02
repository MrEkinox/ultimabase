// Maintenance (D-205, D-207) on `memory()`: Master or the maintenance key
// turns it on and off, every other request and upgrade meets 503
// `MAINTENANCE`, the sockets open close with 1012, and the server follows the
// stored row, or `initial` while there is none.
import { connect } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Http, HttpApi } from '@ultimabase/http'
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
import type {
	Maintenance,
	MaintenanceApi,
	MaintenanceOptions,
} from './index.ts'
import { maintenancePlugin } from './index.ts'
import { MaintenanceState } from './state.ts'

interface Watching extends PluginTypes {
	readonly name: 'watching'
	readonly requires: Http | Maintenance
}

/** The maintenance and HTTP APIs, and the close codes `/live`'s sockets received. */
let api: MaintenanceApi | undefined
let http: HttpApi | undefined
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
		http = plugins.http
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
 * `memory()`, whose rows outlive a restart, whose reads fail while `down`
 * and wait for `held`, and whose `missed()` tells the running application
 * changes were lost.
 */
let down = false
let held: Promise<void> = Promise.resolve()
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
		find: async (read) => {
			await held
			if (down) throw new Error('The database is down.')
			return base.find(read)
		},
		missed: () => feed?.missed(),
	}
}

const notes = routes().get('/notes', (c) => c.json([]))
const app = defineApp({
	database: memory(),
	plugins: [
		httpPlugin({ routes: [notes] }),
		maintenancePlugin({ retryAfter: 90_500, key: 'deploy-key' }),
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
			message:
				'Only the master key or the maintenance key turns the maintenance on or off.',
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

	it('is switched with the maintenance key, which opens nothing else', async () => {
		const deploy = { 'x-ultimabase-maintenance-key': 'deploy-key' }
		const on = await switched(true, deploy)
		expect(on.status).toBe(200)
		expect(maintenance().locked()).toBe(true)
		expect(
			(await fetch(`${running.url}/notes`, { headers: deploy })).status,
		).toBe(503)
		const wrong = await switched(false, {
			'x-ultimabase-maintenance-key': 'deploy-kez',
		})
		expect(wrong.status).toBe(403)
		expect(await wrong.json()).toEqual({
			code: 'ACCESS_DENIED',
			message:
				'Only the master key or the maintenance key turns the maintenance on or off.',
		})
		expect((await switched(false, deploy)).status).toBe(200)
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

/** The application on `database`, which outlives its stops. */
function appOn(database: Adapter, options: MaintenanceOptions = {}) {
	return defineApp({
		database,
		plugins: [
			httpPlugin({ port: 0, drain: 0 }),
			maintenancePlugin(options),
			watching.plugin(),
		],
		models: [Note],
		logger,
	})
}

/** Starts the application on `database`. */
async function started(database: Adapter, options?: MaintenanceOptions) {
	const application = appOn(database, options)
	await application.start()
	return application
}

/** The server's address, once it listens. */
function address(): string {
	if (http === undefined) throw new Error('No api.')
	return http.url()
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

describe('its initial state', () => {
	it('is the state while no row is stored', async () => {
		const locked = await started(kept(), { initial: 'locked' })
		try {
			expect(maintenance().locked()).toBe(true)
			const refused = await fetch(`${address()}/notes`)
			expect(refused.status).toBe(503)
			expect(await refused.json()).toMatchObject({ code: 'MAINTENANCE' })
			expect((await fetch(`${address()}/ready`)).status).toBe(200)
		} finally {
			await locked.stop()
		}
	})

	it('gives way to the stored state, and writes nothing', async () => {
		const database = kept()
		const first = await started(database, { initial: 'locked' })
		try {
			expect(
				await MaintenanceState.findUnique(
					{ where: { key: 'state' } },
					{ as: master },
				),
			).toBeNull()
			await maintenance().unlock()
		} finally {
			await first.stop()
		}
		const again = await started(database, { initial: 'locked' })
		try {
			expect(maintenance().locked()).toBe(false)
		} finally {
			await again.stop()
		}
	})

	it('is refused when neither locked nor unlocked', async () => {
		const initial: unknown = 'on'
		// @ts-expect-error A JavaScript caller may send anything.
		await expect(appOn(memory(), { initial }).start()).rejects.toThrow(
			"The maintenance's initial is 'locked' or 'unlocked'.",
		)
	})
})

describe('its start', () => {
	it('answers 503 UNAVAILABLE while it reads the state', async () => {
		const { promise, resolve } = Promise.withResolvers<void>()
		held = promise
		const starting = appOn(kept(), { initial: 'locked' })
		const start = starting.start()
		try {
			const at = await vi.waitFor(address)
			const refused = await fetch(`${at}/notes`, { headers: asMaster })
			expect(refused.status).toBe(503)
			expect(await refused.json()).toEqual({
				code: 'UNAVAILABLE',
				message: 'The application is starting.',
			})
		} finally {
			held = Promise.resolve()
			resolve()
			await start
			await starting.stop()
		}
	})

	it('fails when the state cannot be read', async () => {
		down = true
		const failing = appOn(kept())
		try {
			await expect(failing.start()).rejects.toThrow('The database is down.')
		} finally {
			down = false
		}
	})
})

describe('the maintenance key', () => {
	const environment = process.env['NODE_ENV']
	afterEach(() => {
		process.env['NODE_ENV'] = environment
	})
	it('is unset when empty', async () => {
		const unset = await started(kept(), { key: '' })
		try {
			const response = await fetch(`${address()}/_ultimabase/maintenance`, {
				method: 'PUT',
				headers: { 'x-ultimabase-maintenance-key': '' },
				body: JSON.stringify({ enabled: true }),
			})
			expect(response.status).toBe(403)
		} finally {
			await unset.stop()
		}
	})

	it('holds a header’s characters only', async () => {
		await expect(
			appOn(memory(), { key: 'deploy key' }).start(),
		).rejects.toThrow(
			'The maintenance key holds a space or a character outside ASCII, which a header cannot carry: use letters, digits and symbols only.',
		)
	})

	it('holds 32 characters in production', async () => {
		process.env['NODE_ENV'] = 'production'
		await expect(
			appOn(memory(), { key: 'deploy-key' }).start(),
		).rejects.toThrow(
			'The maintenance key is 10 characters long; production needs 32 at least: `openssl rand -base64 32` gives one.',
		)
		const long = await started(kept(), { key: 'k'.repeat(32) })
		await long.stop()
	})
})
