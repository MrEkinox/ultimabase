// PostgreSQL plans a composed statement once per connection (D-264).
import { randomUUID } from 'node:crypto'
import { testApplication } from '@ultimabase/testing'
import { defineApp, defineModel, master, transaction } from 'ultimabase'
import { expect, it } from 'vitest'
import { postgres } from './index.ts'
import { preparedStatements } from './prepared.ts'

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

it('leaves a statement of many parameters unprepared', async () => {
	const before = await held()
	const OR = Array.from({ length: 65 }, () => ({ id: randomUUID() }))
	await Note.findMany({ where: { OR } }, M)
	await Note.findMany({ where: { OR } }, M)
	expect(await held()).toEqual(before)
})

it('prepares one statement for a list of ids, however long (D-325)', async () => {
	const before = await held()
	for (const length of [1, 2, 65, 200, 70_000]) {
		const id = Array.from({ length }, () => randomUUID())
		await Note.findMany({ where: { id: { in: id } } }, M)
	}
	expect(await held()).toHaveLength(before.length + 1)
})

it('prepares a statement once asked again', async () => {
	const where = { text: { not: 'asked' } }
	const before = await held()
	await Note.findMany({ where }, M)
	expect(await held()).toEqual(before)
	await Note.findMany({ where }, M)
	expect(await held()).toHaveLength(before.length + 1)
})

/** A read no other `at` under 960 makes the same statement of. */
function shape(at: number): {
	where: { OR: ({ text: string } | { id: string })[] }
	orderBy: Record<string, 'asc' | 'desc'>
} {
	const list = Array.from({ length: (at % 60) + 1 }, () => randomUUID())
	const fields = ['text', 'id', 'createdAt', 'updatedAt']
	const field = fields[Math.floor(at / 60) % fields.length] ?? 'text'
	return {
		where: {
			OR: list.map((value) => (at < 480 ? { text: value } : { id: value })),
		},
		orderBy: { [field]: Math.floor(at / 240) % 2 === 0 ? 'asc' : 'desc' },
	}
}

/** Asks `count` statements from `from` on, `times` times each. */
async function shapes(from: number, count: number, times = 2): Promise<void> {
	for (let at = from; at < from + count; at++) {
		const read = shape(at)
		for (let turn = 0; turn < times; turn++) {
			await Note.findMany(read, M)
		}
	}
}

const room = preparedStatements + 20

it('keeps the statements used last, however many others come', async () => {
	const where = { text: { in: ['used', 'often'] } }
	const read = async (): Promise<unknown> => Note.findMany({ where }, M)
	const before = await held()
	await read()
	await read()
	const hot = (await held()).filter((text) => !before.includes(text))
	expect(hot).toHaveLength(1)
	await shapes(0, 50)
	const first = (await held()).filter(
		(text) => !before.includes(text) && !hot.includes(text),
	)
	for (let from = 50; from < room; from += 50) {
		await read()
		await shapes(from, 50)
	}
	const flooded = await held()
	expect(flooded).toHaveLength(preparedStatements)
	expect(flooded).toEqual(expect.arrayContaining(hot))
	expect(first.filter((text) => flooded.includes(text))).toEqual([])

	const fresh = { text: { in: ['a', 'new'] }, id: { not: randomUUID() } }
	await Note.findMany({ where: fresh }, M)
	await Note.findMany({ where: fresh }, M)
	const after = await held()
	expect(after).toHaveLength(preparedStatements)
	expect(after.filter((text) => !flooded.includes(text))).toHaveLength(1)
})

it('takes no room for what is asked once, however many', async () => {
	const before = await held()
	await shapes(600, 200, 1)
	expect(await held()).toEqual(before)
})

it('makes room inside a transaction', async () => {
	await transaction(async () => {
		await Note.create({ data: { text: 'in the room' } }, M)
		await shapes(0, room)
	})
	const where = { text: 'in the room' }
	expect(await Note.findMany({ where }, M)).toHaveLength(1)
})

/** Reaches the connection twice with `read`, its transaction aborted. */
async function abortedTwice(read: () => Promise<unknown>): Promise<void> {
	const failed = transaction(async () => {
		const asked = await Promise.allSettled([
			database.sql`select 1 / 0`,
			read(),
			read(),
		])
		const refused = asked.map(({ status }) => status === 'rejected')
		expect(refused).toEqual([true, true, true])
		throw new Error('Undo.')
	})
	await expect(failed).rejects.toThrow('Undo.')
}

it('forgets no statement an aborted transaction left unparsed', async () => {
	const where = { text: { contains: 'unparsed' }, id: { not: randomUUID() } }
	await abortedTwice(async () => Note.findMany({ where }, M))
	await transaction(async () => {
		await shapes(0, room)
		await Note.create({ data: { text: 'after' } }, M)
	})
	expect(await Note.findMany({ where: { text: 'after' } }, M)).toHaveLength(1)
})

it('runs on when an aborted transaction refuses to make room', async () => {
	await shapes(0, preparedStatements)
	const read = shape(820)
	await abortedTwice(async () => Note.findMany(read, M))
	// What it refused to forget goes once the transaction is over.
	await Note.findMany(read, M)
	expect(await held()).toHaveLength(preparedStatements)
	await Note.create({ data: { text: 'still there' } }, M)
	const where = { text: 'still there' }
	expect(await Note.findMany({ where }, M)).toHaveLength(1)
})
