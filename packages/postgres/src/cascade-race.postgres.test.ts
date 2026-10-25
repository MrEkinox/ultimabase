// A delete that loads no row (D-102) racing an update that moves a row out
// of its reach: each level deletes among the rows the level above removed,
// so a row the delete skips after its lock wait keeps what references it.
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { Logger } from 'ultimabase'
import { asUser } from '@ultimabase/testing'
import { defineApp, defineModel, master } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const urls = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

async function run(url: string, statement: string): Promise<void> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(statement)
	} finally {
		await client.end()
	}
}

function inSchema(url: string, schema: string): string {
	const separator = url.includes('?') ? '&' : '?'
	const options = `-c search_path=${schema}`
	return `${url}${separator}options=${encodeURIComponent(options)}`
}

const quiet: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => quiet,
}
const M = { as: master }

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({
		code: f.string({ unique: true }),
		novels: f.many(() => Novel),
	}),
}).with({ access: { read: () => true, delete: () => true } })
const Novel = defineModel({
	name: 'Novel',
	fields: (f) => ({
		title: f.string(),
		writer: f.one(() => Writer, { onDelete: 'cascade', inverse: 'novels' }),
		chapters: f.many(() => Chapter),
	}),
})
const Chapter = defineModel({
	name: 'Chapter',
	fields: (f) => ({
		novel: f.one(() => Novel, { onDelete: 'cascade', inverse: 'chapters' }),
	}),
})

async function waitingOnLock(watcher: Client, table: string): Promise<void> {
	for (let tries = 0; tries < 300; tries += 1) {
		const { rows } = await watcher.query<{ n: number }>(
			`select count(*)::int as n from pg_stat_activity
			 where wait_event_type = 'Lock' and query ilike $1`,
			[`%"${table}"%`],
		)
		if ((rows[0]?.n ?? 0) > 0) return
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error('The write never waited on the row lock.')
}

for (const url of urls) {
	describe(`a cascade that races an update on ${url}`, () => {
		let schema = ''
		let app: ReturnType<typeof defineApp>
		let other: Client
		let watcher: Client
		beforeEach(async () => {
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			const database = createAdapter({ url: inSchema(url, schema) })
			app = defineApp({
				database,
				models: [Writer, Novel, Chapter],
				logger: quiet,
			})
			await app.start()
			other = new Client({ connectionString: inSchema(url, schema) })
			await other.connect()
			watcher = new Client({ connectionString: url })
			await watcher.connect()
		})
		afterEach(async () => {
			await other.end()
			await watcher.end()
			await app.stop()
			await run(url, `drop schema "${schema}" cascade`)
		})

		async function raced(
			id: string,
			write: () => Promise<unknown>,
		): Promise<unknown> {
			await other.query('begin')
			await other.query(
				`update "writer" set "code" = 'moved' where "id" = $1`,
				[id],
			)
			const pending = write().catch((error: unknown) => error)
			await waitingOnLock(watcher, 'writer')
			await other.query('commit')
			return pending
		}

		it('delete: keeps the novels of a writer it did not delete', async () => {
			const writer = await Writer.create({ data: { code: 'c' } }, M)
			await Novel.create(
				{ data: { title: 't', writer: { connect: { id: writer.id } } } },
				M,
			)
			const outcome = await raced(writer.id, async () =>
				Writer.delete({ where: { code: 'c' } }, M),
			)
			expect(outcome).toMatchObject({ code: 'NOT_FOUND' })
			expect(await Writer.count({}, M)).toBe(1)
			// The writer survives under its new code: its novel must too.
			expect(await Novel.count({}, M)).toBe(1)
		})

		it('deleteMany: keeps the novels of a writer it did not delete', async () => {
			const writer = await Writer.create({ data: { code: 'c' } }, M)
			await Novel.create(
				{ data: { title: 't', writer: { connect: { id: writer.id } } } },
				M,
			)
			const outcome = await raced(writer.id, async () =>
				Writer.deleteMany({ where: { code: 'c' } }, M),
			)
			expect(outcome).toEqual({ count: 0 })
			expect(await Writer.count({}, M)).toBe(1)
			expect(await Novel.count({}, M)).toBe(1)
		})

		it("a user's deleteMany: keeps the novels of a writer it did not delete", async () => {
			const as = { as: asUser({ id: randomUUID() }) }
			const writer = await Writer.create({ data: { code: 'c' } }, M)
			await Novel.create(
				{ data: { title: 't', writer: { connect: { id: writer.id } } } },
				M,
			)
			const outcome = await raced(writer.id, async () =>
				Writer.deleteMany({ where: { code: 'c' } }, as),
			)
			expect(outcome).toEqual({ count: 0 })
			expect(await Writer.count({}, M)).toBe(1)
			expect(await Novel.count({}, M)).toBe(1)
		})

		/** Moves the writer's novel to another, committed once `write` waits. */
		async function moved(
			write: (writer: string) => Promise<unknown>,
		): Promise<unknown> {
			const writer = await Writer.create({ data: { code: 'c' } }, M)
			const kept = await Writer.create({ data: { code: 'k' } }, M)
			const novel = await Novel.create(
				{ data: { title: 't', writer: { connect: { id: writer.id } } } },
				M,
			)
			await Chapter.create(
				{ data: { novel: { connect: { id: novel.id } } } },
				M,
			)
			await other.query('begin')
			await other.query(`update "novel" set "writer_id" = $1 where "id" = $2`, [
				kept.id,
				novel.id,
			])
			const pending = write(writer.id).catch((error: unknown) => error)
			await waitingOnLock(watcher, 'novel')
			await other.query('commit')
			return pending
		}

		it('delete: keeps the chapters of a novel moved to another writer', async () => {
			const outcome = await moved(async (id) =>
				Writer.delete({ where: { id } }, M),
			)
			expect(outcome).toMatchObject({ code: 'c' })
			// The novel left the writer before its delete: it and its chapter stay.
			expect(await Novel.count({}, M)).toBe(1)
			expect(await Chapter.count({}, M)).toBe(1)
		})

		it("a user's delete: keeps the chapters of a novel moved to another writer", async () => {
			const as = { as: asUser({ id: randomUUID() }) }
			const outcome = await moved(async (id) =>
				Writer.delete({ where: { id } }, as),
			)
			expect(outcome).toMatchObject({ code: 'c' })
			expect(await Novel.count({}, M)).toBe(1)
			expect(await Chapter.count({}, M)).toBe(1)
		})

		it("a user's deleteMany: keeps the chapters of a novel moved to another writer", async () => {
			const as = { as: asUser({ id: randomUUID() }) }
			const outcome = await moved(async (id) =>
				Writer.deleteMany({ where: { id } }, as),
			)
			expect(outcome).toEqual({ count: 1 })
			expect(await Novel.count({}, M)).toBe(1)
			expect(await Chapter.count({}, M)).toBe(1)
		})
	})
}
