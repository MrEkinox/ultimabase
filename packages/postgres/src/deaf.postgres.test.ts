// A feed that does not hear its own notifications (D-337), as behind a pooler
// in transaction mode: queries are answered, notifications do not arrive. A
// proxy drops them while `deaf` holds.
import { createServer, connect } from 'node:net'
import type { Socket } from 'node:net'
import { testApplication } from '@ultimabase/testing'
import type { Logger } from 'ultimabase'
import { defineApp, defineModel, definePlugin, master } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdapter } from './adapter.ts'
import { pulse } from './listen.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')
const target = new URL(server)

let deaf = false
const sockets: Socket[] = []

/** What the server sends, its notifications dropped while `deaf` holds. */
function filtered(near: Socket): (chunk: Buffer) => void {
	let pending = Buffer.alloc(0)
	return (chunk) => {
		pending = Buffer.concat([pending, chunk])
		while (pending.length >= 5) {
			const size = pending.readInt32BE(1) + 1
			if (pending.length < size) return
			const message = pending.subarray(0, size)
			pending = pending.subarray(size)
			if (!(deaf && message[0] === 'A'.charCodeAt(0))) near.write(message)
		}
	}
}

const proxy = createServer((near) => {
	const far = connect(Number(target.port), target.hostname)
	sockets.push(near, far)
	near.on('error', () => undefined)
	far.on('error', () => undefined)
	near.on('close', () => far.destroy())
	far.on('close', () => near.destroy())
	near.pipe(far)
	far.on('data', filtered(near))
})
await new Promise<void>((resolve) => proxy.listen(0, resolve))
const address = proxy.address()
const port = typeof address === 'object' && address ? address.port : 0
const url = new URL(server)
url.host = `localhost:${port}`

// A test application logs no info lines. A line's message is its last
// argument, after the error and correlation id an error line carries.
const said: string[] = []
const logger: Logger = {
	info: () => undefined,
	warn: (...line) => said.push(`warn ${JSON.stringify(line.at(-1))}`),
	error: (...line) => said.push(`error ${JSON.stringify(line.at(-1))}`),
	child: () => logger,
}

const Card = defineModel({
	name: 'Card',
	fields: (f) => ({ title: f.string() }),
})

const told: string[] = []
const watcher = definePlugin({
	name: 'watcher',
	manifest: {
		name: 'watcher',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	// A plugin that hears changes gives the application its feed.
	changed: () => undefined,
	lost: () => told.push('lost'),
	missed: () => told.push('missed'),
})

const quick = { ...pulse }
beforeAll(() => {
	pulse.every = 50
	pulse.silence = 1000
})
afterAll(() => {
	Object.assign(pulse, quick)
	proxy.close()
	for (const socket of sockets) socket.destroy()
})

describe('a feed that does not hear itself', () => {
	testApplication(
		defineApp({
			database: createAdapter({ url: url.href }),
			models: [Card],
			logger,
			plugins: [watcher.plugin()],
		}),
		{ database: 'declared' },
	)

	it('says so once, counts as lost, and stays deaf', async () => {
		// The application starts with its first query, and a pulse is heard.
		await Card.create({ data: { title: 'first' } }, { as: master })
		await new Promise((resolve) => setTimeout(resolve, 200))
		expect(told).toEqual([])
		expect(said).toEqual([])
		deaf = true
		await vi.waitFor(() => expect(told).toEqual(['lost']))
		// Pulses heard again, or a connection back, say nothing of the changes.
		deaf = false
		await new Promise((resolve) => setTimeout(resolve, 300))
		for (const socket of sockets.splice(0)) socket.destroy()
		await vi.waitFor(() => expect(told).toEqual(['lost', 'lost']))
		await new Promise((resolve) => setTimeout(resolve, 300))
		expect(told).toEqual(['lost', 'lost'])
		expect(said).toEqual([
			'error "The change feed does not hear its own notifications: realtime and the caller cache\'s invalidation stop. Is the url behind a pooler in transaction mode, such as PgBouncer? LISTEN needs a direct connection to PostgreSQL."',
			'warn "The change feed lost its connection: it listens again soon."',
		])
	})
})
