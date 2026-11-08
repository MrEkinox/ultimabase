// The row lock a write takes (D-334): a row being updated still takes a new
// reference to it, as under PostgreSQL's own update, and a row being deleted
// keeps one out until its delete ends.
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from 'pg'
import type { Logger } from 'ultimabase'
import { defineApp, defineModel, master, transaction } from 'ultimabase'
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

const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({ label: f.string() }),
})
const Book = defineModel({
	name: 'Book',
	fields: (f) => ({ shelf: f.one(() => Shelf, { onDelete: 'cascade' }) }),
})

async function waitingOnLock(watcher: Client): Promise<void> {
	for (let tries = 0; tries < 300; tries += 1) {
		const { rows } = await watcher.query<{ n: number }>(
			`select count(*)::int as n from pg_stat_activity
			 where wait_event_type = 'Lock' and query ilike '%"book"%'`,
		)
		if ((rows[0]?.n ?? 0) > 0) return
		await delay(10)
	}
	throw new Error('The create never waited on the row lock.')
}

/** Runs `write` on the shelf in a transaction held until `release`. */
async function held(write: (id: string) => Promise<unknown>) {
	const { id } = await Shelf.create({ data: { label: 'a' } }, M)
	const written = Promise.withResolvers<undefined>()
	const release = Promise.withResolvers<undefined>()
	const ended = transaction(async () => {
		await write(id)
		written.resolve(undefined)
		await release.promise
	})
	await written.promise
	const create = Book.create({ data: { shelf: { connect: { id } } } }, M).catch(
		(error: unknown) => error,
	)
	return { create, ended, release: () => release.resolve(undefined) }
}

for (const url of urls) {
	describe(`a write's row lock on ${url}`, () => {
		let schema = ''
		let app: ReturnType<typeof defineApp>
		let watcher: Client
		beforeEach(async () => {
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			const database = createAdapter({ url: inSchema(url, schema) })
			app = defineApp({ database, models: [Shelf, Book], logger: quiet })
			await app.start()
			watcher = new Client({ connectionString: url })
			await watcher.connect()
		})
		afterEach(async () => {
			await watcher.end()
			await app.stop()
			await run(url, `drop schema "${schema}" cascade`)
		})

		it('lets a create reference a shelf an update holds', async () => {
			const { create, ended, release } = await held(async (id) =>
				Shelf.update({ where: { id }, data: { label: 'b' } }, M),
			)
			// Before D-334 the create waited for the update's transaction.
			const first = await Promise.race([create, delay(2000, 'waiting')])
			release()
			await ended
			expect(first).not.toBe('waiting')
			expect(first).not.toBeInstanceOf(Error)
			expect(await Book.count({}, M)).toBe(1)
		})

		it('keeps a create out of a shelf a delete holds', async () => {
			const { create, ended, release } = await held(async (id) =>
				Shelf.delete({ where: { id } }, M),
			)
			await waitingOnLock(watcher)
			release()
			await ended
			// The shelf went: the create fails, and no book points to nothing.
			expect(await create).toBeInstanceOf(Error)
			expect(await Book.count({}, M)).toBe(0)
		})
	})
}
