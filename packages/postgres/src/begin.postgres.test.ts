// A transaction's BEGIN shares its round trip with the first statement (D-297).
import { testApplication } from '@ultimabase/testing'
import { Client } from 'pg'
import { defineApp, defineModel, master, transaction } from 'ultimabase'
import { afterAll, beforeEach, expect, it } from 'vitest'
import { postgres } from './index.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }

/** The statements sent, and whether BEGIN had its answer by then. */
let sent: {
	readonly text: unknown
	readonly answered: boolean
	readonly pipeline: unknown
}[] = []
let answered = false
let refused = false

/** The statement a call of `query` sends. */
function textOf(first: unknown): unknown {
	if (typeof first === 'string') return first
	const text: unknown = Reflect.get(Object(first), 'text')
	return text
}

const query: unknown = Reflect.get(Client.prototype, 'query')
if (typeof query !== 'function') throw new Error('No query on a client.')
Reflect.set(
	Client.prototype,
	'query',
	function spied(this: unknown, ...args: unknown[]): unknown {
		const [first] = args
		const text = textOf(first)
		const pipeline: unknown = Reflect.get(Object(this), 'pipeline')
		sent.push({ text, answered, pipeline })
		if (text !== 'begin') {
			const passed: unknown = Reflect.apply(query, this, args)
			return passed
		}
		if (refused) return Promise.reject(new Error('BEGIN was refused.'))
		answered = false
		const begun: unknown = Reflect.apply(query, this, args)
		return Promise.resolve(begun).then((result) => {
			answered = true
			return result
		})
	},
)
afterAll(() => {
	Reflect.set(Client.prototype, 'query', query)
})

const database = postgres({ url: server, connections: 1 })

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

testApplication(defineApp({ database, models: [Note] }), {
	database: 'declared',
})

beforeEach(() => {
	sent = []
	refused = false
})

/** The notes kept whose text starts with `start`. */
async function kept(start: string): Promise<readonly string[]> {
	const rows = await Note.findMany(
		{ where: { text: { startsWith: start } }, orderBy: { text: 'asc' } },
		M,
	)
	return rows.map(({ text }) => text)
}

/** The time PostgreSQL gives, which a transaction keeps from its start. */
async function clock(): Promise<unknown> {
	const [row] = await database.sql<{ at: string }>`select now()::text as at`
	return row?.at
}

/** Whether two statements in a row run in one transaction, sharing its clock. */
async function inOneTransaction(): Promise<boolean> {
	return (await clock()) === (await clock())
}

it('sends the first statement before the answer to BEGIN', async () => {
	await transaction(async () => {
		await Note.create({ data: { text: 'sent one' } }, M)
		await Note.create({ data: { text: 'sent two' } }, M)
	})
	const begin = sent.findIndex(({ text }) => text === 'begin')
	expect(begin).toBeGreaterThanOrEqual(0)
	const next = sent[begin + 1]
	expect(next?.text).toContain('insert into')
	expect(next?.answered).toBe(false)
	// Without it, `pg` would hold the statement back until that answer.
	expect(next?.pipeline).toBe(true)
	expect(await kept('sent')).toEqual(['sent one', 'sent two'])
})

it('runs what follows BEGIN in its transaction', async () => {
	expect(await transaction(inOneTransaction)).toBe(true)
	expect(await inOneTransaction()).toBe(false)
})

it('gives the connection back clean after a first statement that fails', async () => {
	await expect(
		transaction(async () => {
			await database.sql`select 1 / 0`
		}),
	).rejects.toThrow('division by zero')
	// The one connection refuses this if aborted, and shares a clock if left open.
	await Note.create({ data: { text: 'clean' } }, M)
	expect(await kept('clean')).toEqual(['clean'])
	expect(await inOneTransaction()).toBe(false)
})

it('undoes what came before a statement that fails', async () => {
	await expect(
		transaction(async () => {
			await Note.create({ data: { text: 'undone' } }, M)
			await database.sql`select 1 / 0`
		}),
	).rejects.toThrow('division by zero')
	expect(await kept('undone')).toEqual([])
})

it('prepares anew what a failed first statement left unparsed', async () => {
	expect(await kept('parse')).toEqual([])
	const undone = transaction(async () => {
		const [zero, read] = await Promise.allSettled([
			database.sql`select 1 / 0`,
			kept('parse'),
		])
		expect(zero.status).toBe('rejected')
		expect(read.status).toBe('rejected')
		throw new Error('Undo.')
	})
	await expect(undone).rejects.toThrow('Undo.')
	expect(await kept('parse')).toEqual([])
})

it('tells of a BEGIN refused at the COMMIT', async () => {
	await expect(
		transaction(async () => {
			refused = true
			await database.sql`select 1`
		}),
	).rejects.toThrow('BEGIN was refused.')
})

it('tells of the statement, not of the BEGIN, when both fail', async () => {
	await expect(
		transaction(async () => {
			refused = true
			await database.sql`select 1 / 0`
		}),
	).rejects.toThrow('division by zero')
})

it('fails what a lost connection held, and the next transaction works', async () => {
	await expect(
		transaction(async () => {
			const [own] = await database.sql<{ pid: number }>`
				select pg_backend_pid() as pid`
			await Note.create({ data: { text: 'lost' } }, M)
			const other = new Client({ connectionString: server })
			await other.connect()
			await other.query('select pg_terminate_backend($1)', [own?.pid])
			await other.end()
			await database.sql`select 1`
		}),
	).rejects.toThrow('connection')
	expect(await kept('lost')).toEqual([])
	await transaction(async () => {
		await Note.create({ data: { text: 'next' } }, M)
	})
	expect(await kept('next')).toEqual(['next'])
})
