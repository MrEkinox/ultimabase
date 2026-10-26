// A relation write or a hooked cascade racing an update that moves its row
// elsewhere: after the lock wait, the write leaves the moved row as moved.
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
const open = { read: () => true, update: () => true, delete: () => true }

const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({
		books: f.many(() => Book),
		tagged: f.many(() => Tagged),
	}),
}).with({ access: open })
const Book = defineModel({
	name: 'Book',
	fields: (f) => ({
		shelf: f.one(() => Shelf, { optional: true, inverse: 'books' }),
	}),
}).with({ access: open })
/** A book with an update hook: a move reads it and updates it by id. */
const Tagged = defineModel({
	name: 'Tagged',
	fields: (f) => ({
		shelf: f.one(() => Shelf, { optional: true, inverse: 'tagged' }),
	}),
}).with({ access: open, hooks: { beforeUpdate: async () => {} } })

const Author = defineModel({
	name: 'Author',
	fields: (f) => ({ tomes: f.many(() => Tome) }),
}).with({ access: open })
/** A delete hook: the cascade loads its rows and deletes them by id. */
const Tome = defineModel({
	name: 'Tome',
	fields: (f) => ({
		author: f.one(() => Author, { onDelete: 'cascade', inverse: 'tomes' }),
		pages: f.many(() => Page),
	}),
}).with({ access: open, hooks: { beforeDelete: async () => {} } })
const Page = defineModel({
	name: 'Page',
	fields: (f) => ({
		tome: f.one(() => Tome, { onDelete: 'cascade', inverse: 'pages' }),
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

async function shelved(model: typeof Book | typeof Tagged) {
	const shelf = await Shelf.create({ data: {} }, M)
	const kept = await Shelf.create({ data: {} }, M)
	const data = { shelf: { connect: { id: shelf.id } } }
	const book =
		model === Book
			? await Book.create({ data }, M)
			: await Tagged.create({ data }, M)
	return { shelf: shelf.id, kept: kept.id, book: book.id }
}

for (const url of urls) {
	describe(`a write that races a move on ${url}`, () => {
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
				models: [Shelf, Book, Tagged, Author, Tome, Page],
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

		/** Moves `id` of `table` to `to`, committed once `write` waits on it. */
		async function raced(
			table: string,
			column: string,
			id: string,
			to: string,
			write: () => Promise<unknown>,
		): Promise<unknown> {
			await other.query('begin')
			await other.query(
				`update "${table}" set "${column}" = $1 where "id" = $2`,
				[to, id],
			)
			const pending = write().catch((error: unknown) => error)
			await waitingOnLock(watcher, table)
			await other.query('commit')
			return pending
		}

		for (const [label, as] of [
			['master', M],
			['a user', { as: asUser({ id: randomUUID() }) }],
		] as const) {
			it(`disconnect by ${label}: leaves a book moved to another shelf`, async () => {
				const { shelf, kept, book } = await shelved(Book)
				await raced('book', 'shelf_id', book, kept, async () =>
					Shelf.update(
						{
							where: { id: shelf },
							data: { books: { disconnect: [{ id: book }] } },
						},
						as,
					),
				)
				const found = await Book.findUnique(
					{ where: { id: book }, include: { shelf: true } },
					M,
				)
				expect(found?.shelf?.id).toBe(kept)
			})

			it(`hooked disconnect by ${label}: leaves a book moved to another shelf`, async () => {
				const { shelf, kept, book } = await shelved(Tagged)
				await raced('tagged', 'shelf_id', book, kept, async () =>
					Shelf.update(
						{
							where: { id: shelf },
							data: { tagged: { disconnect: [{ id: book }] } },
						},
						as,
					),
				)
				const found = await Tagged.findUnique(
					{ where: { id: book }, include: { shelf: true } },
					M,
				)
				expect(found?.shelf?.id).toBe(kept)
			})

			it(`hooked cascade by ${label}: keeps a tome moved to another author`, async () => {
				const author = await Author.create({ data: {} }, M)
				const kept = await Author.create({ data: {} }, M)
				const tome = await Tome.create(
					{ data: { author: { connect: { id: author.id } } } },
					M,
				)
				await Page.create({ data: { tome: { connect: { id: tome.id } } } }, M)
				const outcome = await raced(
					'tome',
					'author_id',
					tome.id,
					kept.id,
					async () => Author.delete({ where: { id: author.id } }, as),
				)
				expect(outcome).toMatchObject({ id: author.id })
				expect(await Tome.count({}, M)).toBe(1)
				expect(await Page.count({}, M)).toBe(1)
			})
		}
	})
}
