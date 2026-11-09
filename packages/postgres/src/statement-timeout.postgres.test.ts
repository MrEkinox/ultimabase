// A statement timeout (D-331): PostgreSQL ends a statement past it, a
// connection silent past it is given up with no realtime to notice, and a
// migration takes the time it needs.
import { randomUUID } from 'node:crypto'
import { connect, createServer } from 'node:net'
import type { Socket } from 'node:net'
import type { Logger } from 'ultimabase'
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from 'vitest'
import type { Postgres } from './adapter.ts'
import { grace } from './deadline.ts'
import { postgres } from './index.ts'
import { file, inSchema, query, url } from './test/migrations.ts'

const warned: string[] = []
const logger: Logger = {
	info: () => undefined,
	warn: (message) =>
		warned.push(
			typeof message === 'string' ? message : JSON.stringify(message),
		),
	error: () => undefined,
	child: () => logger,
}

const timedOut = 'canceling statement due to statement timeout'

/** What passes through to the server, and what `muted` silences for good. */
let pairs: [Socket, Socket][] = []
const target = new URL(url)
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

let schema = ''
let started: Postgres[] = []

/** An adapter on the test's schema, its statements ended past 200 ms. */
async function opened(
	more: { readonly connections?: number; readonly proxied?: boolean } = {},
): Promise<Postgres> {
	const at = new URL(inSchema(schema))
	if (more.proxied === true) at.host = `localhost:${port}`
	const database = postgres({
		url: at.href,
		statementTimeout: 200,
		...(more.connections === undefined
			? {}
			: { connections: more.connections }),
	})
	started.push(database)
	await database.start({ models: [] }, logger)
	return database
}

const quick = grace.after
beforeAll(() => {
	grace.after = 300
})
afterAll(() => {
	grace.after = quick
	proxy.close()
	for (const [near, far] of pairs) {
		near.destroy()
		far.destroy()
	}
})
beforeEach(async () => {
	warned.length = 0
	schema = `t_${randomUUID().replaceAll('-', '')}`
	await query(url, `create schema "${schema}"`)
})
afterEach(async () => {
	await Promise.all(started.map(async (database) => database.stop()))
	started = []
	await query(url, `drop schema "${schema}" cascade`)
})

describe('a statement timeout', () => {
	it('ends a statement past it, and the connection serves on', async () => {
		const database = await opened({ connections: 1 })
		await expect(database.sql`select pg_sleep(1)`).rejects.toThrow(timedOut)
		expect(await database.sql`select pg_sleep(0.05), 1 as one`).toEqual([
			{ pg_sleep: '', one: 1 },
		])
		expect(warned).toEqual([])
	})

	it('gives up a connection that stays silent past it, with no realtime', async () => {
		const database = await opened({ connections: 1, proxied: true })
		await database.sql`select 1`
		muted()
		const start = Date.now()
		await expect(database.sql`select pg_sleep(60)`).rejects.toThrow(
			'PostgreSQL stopped answering.',
		)
		expect(Date.now() - start).toBeLessThan(3000)
		expect(warned).toEqual([
			'PostgreSQL did not answer a statement for 0.5s: its connection is given up.',
		])
		expect(await database.sql`select 1 as one`).toEqual([{ one: 1 }])
	})

	it('lets a migration run past it, then ends statements again', async () => {
		// One connection: the one the migration lifted the timeout on.
		const database = await opened({ connections: 1 })
		const { migrations } = database
		if (migrations === undefined) throw new Error('postgres() migrates.')
		await migrations.apply({
			kind: 'deploy',
			known: ['1_slow.sql', '2_slow.sql'],
			files: [
				file('1_slow.sql', 'select pg_sleep(0.6);'),
				file(
					'2_slow.sql',
					'-- ultimabase no transaction\nselect pg_sleep(0.6);\n',
					false,
				),
			],
			to: migrations.snapshot({ models: [] }),
		})
		expect(warned).toEqual([])
		await expect(database.sql`select pg_sleep(1)`).rejects.toThrow(timedOut)
	})

	it('is refused unless a whole number of milliseconds', async () => {
		for (const statementTimeout of [0, 1.5, -1, 2_147_483_648]) {
			const database = postgres({ url, statementTimeout })
			await expect(database.start({ models: [] }, logger)).rejects.toThrow(
				`postgres() takes statementTimeout as a whole number of milliseconds, from 1 to 2147483647, not ${statementTimeout}.`,
			)
		}
	})
})
