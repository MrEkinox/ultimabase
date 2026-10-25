// Soft delete (D-89, D-90, D-96) on PostgreSQL: a cascade that reaches a
// soft-deleted model, and redirected deletes that race.
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { Logger } from 'ultimabase'
import { softDelete, softDeletePlugin } from '@ultimabase/soft-delete'
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
const committed: string[] = []

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({ name: f.string(), notes: f.many(() => Note) }),
})
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		writer: f.one(() => Writer, { onDelete: 'cascade', inverse: 'notes' }),
	}),
	use: [softDelete()],
}).with({
	hooks: {
		afterDeleteCommit: ({ record }) => {
			committed.push(record.text)
		},
	},
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

async function written() {
	const writer = await Writer.create({ data: { name: 'w' } }, M)
	const note = await Note.create(
		{ data: { text: 'n', writer: { connect: { id: writer.id } } } },
		M,
	)
	return { writer: writer.id, note: note.id }
}

for (const url of urls) {
	describe(`soft delete on ${url}`, () => {
		let schema = ''
		let app: ReturnType<typeof defineApp>
		let other: Client
		let watcher: Client
		beforeEach(async () => {
			committed.length = 0
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			const database = createAdapter({ url: inSchema(url, schema) })
			app = defineApp({
				database,
				models: [Writer, Note],
				plugins: [softDeletePlugin()],
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

		it('a cascade: deletes the note of a deleted writer', async () => {
			const { writer } = await written()
			const outcome = await Writer.delete({ where: { id: writer } }, M).catch(
				(error: unknown) => error,
			)
			expect(outcome).toMatchObject({ name: 'w' })
			expect(await Note.trash.count({}, M)).toBe(0)
			expect(await Note.count({}, M)).toBe(0)
		})

		it('a cascade: deletes a writer whose note is in the trash', async () => {
			const { writer, note } = await written()
			await Note.delete({ where: { id: note } }, M)
			const outcome = await Writer.delete({ where: { id: writer } }, M).catch(
				(error: unknown) => error,
			)
			expect(outcome).toMatchObject({ name: 'w' })
			expect(await Note.trash.count({}, M)).toBe(0)
		})

		it('two deletes at once: one trashes the note, the other finds none', async () => {
			const { note } = await written()
			await other.query('begin')
			await other.query(
				`update "note" set "deleted_at" = now() where "id" = $1`,
				[note],
			)
			const pending = Note.delete({ where: { id: note } }, M).catch(
				(error: unknown) => error,
			)
			await waitingOnLock(watcher, 'note')
			await other.query('commit')
			expect(await pending).toMatchObject({ code: 'NOT_FOUND' })
			expect(committed).toStrictEqual([])
		})

		it('a deleteMany at once: counts the notes it trashed', async () => {
			const { note } = await written()
			await other.query('begin')
			await other.query(
				`update "note" set "deleted_at" = now() where "id" = $1`,
				[note],
			)
			const pending = Note.deleteMany({ where: {} }, M).catch(
				(error: unknown) => error,
			)
			await waitingOnLock(watcher, 'note')
			await other.query('commit')
			expect(await pending).toEqual({ count: 0 })
			expect(committed).toStrictEqual([])
		})
	})
}
