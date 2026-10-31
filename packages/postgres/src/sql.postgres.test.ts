// Raw SQL on postgres() (D-137), and a test file on the declared database:
// its own schema, emptied before each test and dropped after the file, the
// schema the url names left as it was.
import { randomUUID } from 'node:crypto'
import { testApplication } from '@ultimabase/testing'
import { Kysely, PostgresDialect } from 'kysely'
import { Client, Pool } from 'pg'
import { defineApp, defineModel, master, transaction } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { postgres } from './index.ts'
import { emptied } from './scratch.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

async function query(statement: string): Promise<unknown[]> {
	const client = new Client({ connectionString: server })
	await client.connect()
	try {
		return (await client.query<Record<string, unknown>>(statement)).rows
	} finally {
		await client.end()
	}
}

function inSchema(url: string, schema: string): string {
	const separator = url.includes('?') ? '&' : '?'
	return `${url}${separator}options=${encodeURIComponent(`-c search_path=${schema}`)}`
}

const M = { as: master }
// The development schema the url names, holding an `entry` table of its own.
const dev = `t_${randomUUID().replaceAll('-', '')}`
const database = postgres({ url: inSchema(server, dev) })

const Entry = defineModel({
	name: 'Entry',
	fields: (f) => ({ text: f.string() }),
}).with({
	hooks: {
		afterCreate: async ({ record }) => {
			await database.sql`insert into audit (text) values (${record.text})`
		},
	},
})

let scratch = ''

beforeAll(async () => {
	await query(`create schema "${dev}"`)
	await query(`create table "${dev}".entry (text text)`)
	await query(`insert into "${dev}".entry values ('kept')`)
})

afterAll(async () => query(`drop schema "${dev}" cascade`))

it('runs only once postgres() is started', async () => {
	await expect(database.sql`select 1`).rejects.toThrow(
		'postgres() is not started.',
	)
})

describe("a test file on { database: 'declared' }", () => {
	const running = testApplication(defineApp({ database, models: [Entry] }), {
		database: 'declared',
	})

	it('runs in a schema of its own, with the values as parameters', async () => {
		const [own] = await database.sql<{
			name: string
		}>`select current_schema() as name`
		scratch = own?.name ?? ''
		expect(scratch).toMatch(/^ultimabase_test_[0-9a-f]{8}$/u)
		await database.sql`create table audit (text text)`
		await Entry.create({ data: { text: "it's" } }, M)
		const rows = await database.sql<{
			text: string
		}>`select text from entry where text = ${"it's"}`
		expect(rows).toEqual([{ text: "it's" }])
		expect(await database.sql`select text from audit`).toEqual([
			{ text: "it's" },
		])
	})

	it('starts each test on empty tables', async () => {
		expect(await database.sql`select text from entry`).toEqual([])
		expect(await database.sql`select text from audit`).toEqual([])
	})

	it('joins the open transaction, which a rollback undoes', async () => {
		const undone = transaction(async () => {
			await Entry.create({ data: { text: 'one' } }, M)
			await database.sql`insert into audit (text) values ('two')`
			throw new Error('Undo.')
		})
		await expect(undone).rejects.toThrow('Undo.')
		expect(await Entry.count({}, M)).toBe(0)
		expect(await database.sql`select text from audit`).toEqual([])
	})

	// The queries are recorded on the adapter itself: a wrapper would hide
	// the open transaction from `sql` (D-177).
	it('joins the open transaction while a test records its queries', async () => {
		const recorded = running.queries(async () =>
			transaction(async () => {
				await Entry.create({ data: { text: 'one' } }, M)
				throw new Error('Undo.')
			}),
		)
		await expect(recorded).rejects.toThrow('Undo.')
		// The hook's insert into audit was undone with the create.
		expect(await Entry.count({}, M)).toBe(0)
		expect(await database.sql`select text from audit`).toEqual([])
		// With an after hook, a create reads its row again (D-88).
		expect(
			await running.queries(async () =>
				Entry.create({ data: { text: 'two' } }, M),
			),
		).toStrictEqual(['write Entry', 'find Entry', 'find Entry'])
	})

	it('fails the transaction it joins', async () => {
		const failed = transaction(async () => {
			await database.sql`insert into audit (text) values ('one')`
			await database.sql`select * from missing`.catch(() => undefined)
		})
		await expect(failed).rejects.toThrow('relation "missing" does not exist')
		expect(await database.sql`select text from audit`).toEqual([])
	})

	it("undoes the create a hook's statement fails", async () => {
		await database.sql`drop table audit`
		await expect(Entry.create({ data: { text: 'one' } }, M)).rejects.toThrow(
			'relation "audit" does not exist',
		)
		expect(await Entry.count({}, M)).toBe(0)
	})
})

it('drops it after the file, and leaves the schema the url names', async () => {
	expect(
		await query(`select 1 from pg_namespace where nspname = '${scratch}'`),
	).toEqual([])
	expect(await query(`select text from "${dev}".entry`)).toEqual([
		{ text: 'kept' },
	])
})

it('refuses connections that do not take the schema', async () => {
	const name = `ultimabase_test_${randomUUID().slice(0, 8)}`
	const db = new Kysely<object>({
		dialect: new PostgresDialect({
			pool: new Pool({ connectionString: server }),
		}),
	})
	try {
		await expect(emptied(db, name)).rejects.toThrow(
			'does a pooler drop their startup options?',
		)
	} finally {
		await db.destroy()
		await query(`drop schema if exists "${name}"`)
	}
})
