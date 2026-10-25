// Master's update by id loads no row (D-99 point 5): its check locks the row,
// so a row another transaction hides from `beforeFind` while the update
// waits on its lock counts 0, and nothing of the write runs.
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { Logger } from 'ultimabase'
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

const Doc = defineModel({
	name: 'Doc',
	fields: (f) => ({
		label: f.string(),
		archived: f.boolean({ default: false }),
		notes: f.many(() => Note),
	}),
}).with({
	hooks: { beforeFind: ({ where }) => where({ archived: false }) },
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		doc: f.one(() => Doc, { optional: true, inverse: 'notes' }),
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
	describe(`a Master update by id racing a hiding update on ${url}`, () => {
		let schema = ''
		let app: ReturnType<typeof defineApp>
		let other: Client
		let watcher: Client
		beforeEach(async () => {
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			const database = createAdapter({ url: inSchema(url, schema) })
			app = defineApp({ database, models: [Doc, Note], logger: quiet })
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

		/** Archives the doc, committed once `write` waits on its lock. */
		async function hidden(write: () => Promise<unknown>): Promise<unknown> {
			await other.query('begin')
			await other.query(`update "doc" set "archived" = true`)
			const pending = write().catch((error: unknown) => error)
			await waitingOnLock(watcher, 'doc')
			await other.query('commit')
			return pending
		}

		it('refuses a row beforeFind hid while the update waited', async () => {
			const doc = await Doc.create({ data: { label: 'a' } }, M)
			const outcome = await hidden(async () =>
				Doc.update({ where: { id: doc.id }, data: { label: 'b' } }, M),
			)
			expect(outcome).toMatchObject({ code: 'NOT_FOUND' })
			const { rows } = await other.query(`select "label" from "doc"`)
			expect(rows).toEqual([{ label: 'a' }])
		})

		it('runs none of its nested writes on a row hidden meanwhile', async () => {
			const doc = await Doc.create({ data: { label: 'a' } }, M)
			const note = await Note.create({ data: {} }, M)
			const outcome = await hidden(async () =>
				Doc.update(
					{
						where: { id: doc.id },
						data: { label: 'b', notes: { connect: [{ id: note.id }] } },
					},
					M,
				),
			)
			expect(outcome).toMatchObject({ code: 'NOT_FOUND' })
			const { rows } = await other.query(`select "doc_id" from "note"`)
			expect(rows).toEqual([{ doc_id: null }])
		})

		it('updates a row changed but still visible after the wait', async () => {
			const doc = await Doc.create({ data: { label: 'a' } }, M)
			await other.query('begin')
			await other.query(`update "doc" set "label" = 'c'`)
			const pending = Doc.update(
				{ where: { id: doc.id }, data: { label: 'b' } },
				M,
			)
			await waitingOnLock(watcher, 'doc')
			await other.query('commit')
			expect(await pending).toMatchObject({ label: 'b' })
		})
	})
}
