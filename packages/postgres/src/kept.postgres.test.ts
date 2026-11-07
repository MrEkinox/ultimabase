// A test file keeps its connections from one start to the next (D-309).
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { Changed } from 'ultimabase'
import { defineApp, defineModel, definePlugin, master } from 'ultimabase'
import type { QuietRuns, Scratch } from 'ultimabase/internal'
import { quietRuns, scratchOf } from 'ultimabase/internal'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createAdapter } from './adapter.ts'
import { channelOf } from './listen.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
const named = `kept_${randomUUID().replaceAll('-', '')}`
const database = createAdapter({ url: `${server}?application_name=${named}` })

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

const Other = defineModel({
	name: 'Other',
	fields: (f) => ({ size: f.number() }),
})

let seen: Changed[] = []
const watcher = definePlugin({
	name: 'watcher',
	manifest: {
		name: 'watcher',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	changed: (changes) => {
		seen.push(...changes)
	},
})

function runsOf(app: unknown): QuietRuns {
	const runs = quietRuns(app)
	if (runs === undefined) throw new TypeError('Not an application.')
	return runs
}

const plain = runsOf(defineApp({ database, models: [Note] }))
const wider = runsOf(defineApp({ database, models: [Note, Other] }))
const fed = runsOf(
	defineApp({ database, models: [Note], plugins: [watcher.plugin()] }),
)

let scratch: Scratch | undefined
/** The runs a test started and did not stop. */
let running: { stop: () => Promise<void> }[] = []
beforeEach(() => {
	scratch = scratchOf(database)?.()
	seen = []
})
afterEach(async () => {
	for (const run of running) await run.stop()
	running = []
	await scratch?.drop()
})

/** The pids `statement` lists, asked on a connection of its own. */
async function pids(statement: string): Promise<number[]> {
	const client = new Client({ connectionString: server })
	await client.connect()
	try {
		const { rows } = await client.query<{ pid: number }>(statement)
		return rows.map(({ pid }) => pid)
	} finally {
		await client.end()
	}
}

/** The backends of the pool. */
const pooled = async (): Promise<number[]> =>
	pids(
		`select pid from pg_stat_activity where application_name = '${named}' order by pid`,
	)

/** The running application's schema. */
async function schemaOf(): Promise<string> {
	const [{ schema } = { schema: '' }] = await database.sql<{
		schema: string
	}>`select current_schema() as schema`
	return schema
}

/** The backend that listens on the running application's channel. */
async function listener(): Promise<number[]> {
	const listen = `listen "${channelOf(await schemaOf())}"`
	return pids(
		`select pid from pg_stat_activity where application_name = 'ultimabase-feed' and query = '${listen}'`,
	)
}

/** Starts a run of `runs`, the first of a test or the next. */
async function started(
	runs: QuietRuns,
): Promise<{ stop: () => Promise<void> }> {
	const run = runs.on(database)
	await run.start()
	running.push(run)
	return {
		stop: async () => {
			running = running.filter((each) => each !== run)
			await run.stop()
		},
	}
}

it('keeps the connections from one start to the next, the tables emptied', async () => {
	const first = await started(plain)
	await Note.create({ data: { text: 'first' } }, M)
	const before = await pooled()
	await first.stop()
	const next = await started(plain)
	expect(await Note.findMany({}, M)).toEqual([])
	expect(await pooled()).toEqual(before)
	await next.stop()
})

it('opens connections of its own for other models', async () => {
	const first = await started(plain)
	const before = await pooled()
	await first.stop()
	const next = await started(wider)
	const after = await pooled()
	expect(after.filter((pid) => before.includes(pid))).toEqual([])
	await Other.create({ data: { size: 1 } }, M)
	await next.stop()
})

it('opens connections of its own when a query still ran at stop', async () => {
	const first = await started(plain)
	const before = await pooled()
	const slow = (async () => database.sql`select pg_sleep(0.3)`)()
	const sleeping = `select pid from pg_stat_activity where application_name = '${named}' and query like 'select pg_sleep%'`
	await vi.waitFor(async () => expect(await pids(sleeping)).toHaveLength(1))
	// The application waits for its own queries: this one it does not.
	await database.stop()
	await slow
	await first.stop()
	const next = await started(plain)
	await Note.findMany({}, M)
	const after = await pooled()
	expect(after.filter((pid) => before.includes(pid))).toEqual([])
	await next.stop()
})

it('gives no feed what is committed between two runs', async () => {
	const first = await started(fed)
	const heard = await listener()
	expect(heard).toHaveLength(1)
	const channel = channelOf(await schemaOf())
	await first.stop()
	seen = []
	const client = new Client({ connectionString: server })
	await client.connect()
	await client.query('select pg_notify($1, $2)', [
		channel,
		'["insert","Note",null,["between"]]',
	])
	await client.end()
	await new Promise((resolve) => setTimeout(resolve, 50))
	const next = await started(fed)
	expect(await listener()).toEqual(heard)
	const { id } = await Note.create({ data: { text: 'last' } }, M)
	await vi.waitFor(() => expect(seen).not.toEqual([]))
	const inserts = seen.flatMap((change) =>
		change.kind === 'insert' ? (change.ids ?? []) : [],
	)
	expect(inserts).toEqual([id])
	await next.stop()
})

it('opens a pool of its own once the feed has a taker, or no longer', async () => {
	const first = await started(plain)
	const before = await pooled()
	await first.stop()
	const fedRun = await started(fed)
	const during = await pooled()
	expect(await listener()).toHaveLength(1)
	await fedRun.stop()
	const last = await started(plain)
	const after = await pooled()
	expect(during.filter((pid) => before.includes(pid))).toEqual([])
	expect(after.filter((pid) => during.includes(pid))).toEqual([])
	await last.stop()
})

it('ends the kept connections once the tables are dropped', async () => {
	const run = await started(fed)
	await Note.create({ data: { text: 'kept' } }, M)
	await run.stop()
	expect(await pooled()).not.toEqual([])
	await scratch?.drop()
	await scratch?.drop()
	await vi.waitFor(async () => expect(await pooled()).toEqual([]))
})
