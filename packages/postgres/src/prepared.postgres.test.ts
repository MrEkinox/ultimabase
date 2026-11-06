// PostgreSQL plans a composed statement once per connection (D-264).
import { randomUUID } from 'node:crypto'
import { testApplication } from '@ultimabase/testing'
import { defineApp, defineModel, master, transaction } from 'ultimabase'
import { expect, it } from 'vitest'
import { postgres } from './index.ts'
import { prepare, preparedStatements } from './prepared.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
const database = postgres({ url: server, connections: 1 })

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

/** The statements the one connection holds prepared. */
async function held(): Promise<readonly string[]> {
	const rows = await database.sql<{
		statement: string
	}>`select statement from pg_prepared_statements`
	return rows.map(({ statement }) => statement)
}

testApplication(defineApp({ database, models: [Note] }), {
	database: 'declared',
})

it('prepares a composed statement once, whatever its values', async () => {
	await Note.create({ data: { text: 'one' } }, M)
	await Note.create({ data: { text: 'two' } }, M)
	const creates = (await held()).filter((text) => text.includes('insert into'))
	expect(creates).toHaveLength(1)
	const rows = await Note.findMany({ orderBy: { text: 'asc' } }, M)
	expect(rows.map(({ text }) => text)).toEqual(['one', 'two'])
})

it('leaves the raw SQL alone', async () => {
	await database.sql`select 7 as seven`
	expect((await held()).join()).not.toContain('seven')
})

it('prepares anew what a failed transaction could not', async () => {
	await Note.create({ data: { text: 'kept' } }, M)
	const where = { text: { startsWith: 'ke' } }
	const undone = transaction(async () => {
		const [zero, read] = await Promise.allSettled([
			database.sql`select 1 / 0`,
			Note.findMany({ where }, M),
		])
		expect(zero.status).toBe('rejected')
		expect(read.status).toBe('rejected')
		throw new Error('Undo.')
	})
	await expect(undone).rejects.toThrow('Undo.')
	const rows = await Note.findMany({ where }, M)
	expect(rows.map(({ text }) => text)).toEqual(['kept'])
})

it('reads on under a statement it prepared, the table changed', async () => {
	await Note.create({ data: { text: 'there' } }, M)
	const read = async (): Promise<number> =>
		(await Note.findMany({ where: { text: { endsWith: 'ere' } } }, M)).length
	expect(await read()).toBe(1)
	await database.sql`alter table note add column extra text`
	expect(await read()).toBe(1)
	await database.sql`alter table note alter column text type varchar(99)`
	expect(await read()).toBe(1)
})

it('leaves unprepared what has no room', async () => {
	const statements = (await held()).length
	const id = Array.from({ length: 65 }, () => randomUUID())
	expect(await Note.findMany({ where: { id: { in: id } } }, M)).toEqual([])
	expect(await held()).toHaveLength(statements)
	for (let at = 0; at < preparedStatements; at++) prepare(`select ${at}`, 0)
	const where = { text: { in: ['none', 'nor this'] } }
	expect(await Note.findMany({ where }, M)).toEqual([])
	expect(await held()).toHaveLength(statements)
})
