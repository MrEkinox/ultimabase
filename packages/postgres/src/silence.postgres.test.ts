// A network that fails with no one told (D-287): the database moves, what
// went to its old address gets no answer and no reset, and nothing else tells.
import { createServer, connect } from 'node:net'
import type { Socket } from 'node:net'
import { testApplication } from '@ultimabase/testing'
import type { Logger } from 'ultimabase'
import { defineApp, defineModel, definePlugin, master } from 'ultimabase'
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest'
import { createAdapter } from './adapter.ts'
import { pulse } from './listen.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')
const target = new URL(server)

/** What passes through, and what `muted` silences for good. */
let pairs: [Socket, Socket][] = []
const proxy = createServer((near) => {
	const far = connect(Number(target.port), target.hostname)
	near.on('error', () => undefined)
	far.on('error', () => undefined)
	near.on('close', () => far.destroy())
	far.on('close', () => near.destroy())
	near.pipe(far)
	far.pipe(near)
	pairs.push([near, far])
})
const muted = (): void => {
	for (const [near, far] of pairs) {
		near.unpipe(far)
		far.unpipe(near)
		near.pause()
		far.pause()
	}
	pairs = []
}
await new Promise<void>((resolve) => proxy.listen(0, resolve))
const address = proxy.address()
const port = typeof address === 'object' && address ? address.port : 0
const url = new URL(server)
url.host = `localhost:${port}`

const M = { as: master }
const warned: string[] = []
const logger: Logger = {
	info: () => undefined,
	warn: (message) => warned.push(JSON.stringify(message)),
	error: () => undefined,
	child: () => logger,
}
const database = createAdapter({ url: url.href })

const Card = defineModel({
	name: 'Card',
	fields: (f) => ({ title: f.string() }),
})

let seen: string[] = []
let missed = 0
let lost = 0
const watcher = definePlugin({
	name: 'watcher',
	manifest: {
		name: 'watcher',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	changed: (changes) => {
		for (const change of changes) {
			if ('ids' in change) seen.push(...(change.ids ?? []))
		}
	},
	lost: () => {
		lost += 1
	},
	missed: () => {
		missed += 1
	},
})

const quick = { ...pulse }
beforeAll(() => {
	pulse.every = 50
	pulse.silence = 1000
})
afterAll(() => {
	Object.assign(pulse, quick)
	proxy.close()
	for (const [near, far] of pairs) {
		near.destroy()
		far.destroy()
	}
})

describe('a database that goes silent', () => {
	testApplication(
		defineApp({
			database,
			models: [Card],
			logger,
			plugins: [watcher.plugin()],
		}),
		{ database: 'declared' },
	)
	beforeEach(() => {
		seen = []
		missed = 0
		lost = 0
	})

	it('leaves a slow statement alone while the database answers', async () => {
		// A slow statement is not a silent database: the answer to the question
		// comes on the listener's own connection.
		await database.sql`select pg_sleep(1.5)`
		expect([lost, missed]).toEqual([0, 0])
		expect(warned).toEqual([])
	})

	it('fails what waits for an answer, then hears and serves again', async () => {
		await Card.create({ data: { title: 'first' } }, M)
		muted()
		const started = Date.now()
		await expect(database.sql`select pg_sleep(60)`).rejects.toThrow(
			'PostgreSQL stopped answering.',
		)
		// The silence and a pulse, no more: an unreferenced immediate waited
		// for the next event, 3.5s here.
		expect(Date.now() - started).toBeLessThan(2000)
		// Told lost, then missed once back: a cache keeps nothing meanwhile (D-332).
		await vi.waitFor(() => expect([lost, missed]).toEqual([1, 1]), {
			timeout: 5000,
		})
		const { id } = await Card.create({ data: { title: 'back' } }, M)
		await vi.waitFor(() => expect(seen).toContain(id))
		expect(warned).toContain(
			'"PostgreSQL did not answer for 1s: its connections are given up."',
		)
	})
})
