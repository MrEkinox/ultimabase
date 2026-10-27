// A locked read of many rows locks them in `id` order (D-133 point 6): while
// another transaction holds the first row, `updateMany` and `deleteMany` wait
// on it without holding the next one, which the table stores first.
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

/** Hooks make Master's calls read and lock their rows first. */
const Task = defineModel({
	name: 'Task',
	fields: (f) => ({ label: f.string() }),
}).with({
	hooks: { beforeUpdate: () => undefined, beforeDelete: () => undefined },
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
	throw new Error('The call never waited on the row lock.')
}

for (const url of urls) {
	describe(`many-row calls locking in id order on ${url}`, () => {
		let schema = ''
		let app: ReturnType<typeof defineApp>
		let holder: Client
		let prober: Client
		let watcher: Client
		beforeEach(async () => {
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			const database = createAdapter({ url: inSchema(url, schema) })
			app = defineApp({ database, models: [Task], logger: quiet })
			await app.start()
			holder = new Client({ connectionString: inSchema(url, schema) })
			await holder.connect()
			prober = new Client({ connectionString: inSchema(url, schema) })
			await prober.connect()
			watcher = new Client({ connectionString: url })
			await watcher.connect()
		})
		afterEach(async () => {
			await holder.end()
			await prober.end()
			await watcher.end()
			await app.stop()
			await run(url, `drop schema "${schema}" cascade`)
		})

		/**
		 * Holds the lower id while `call` waits on it, and finds the higher id,
		 * stored first, free: the call locks nothing past the row it waits on.
		 */
		async function inOrder(call: () => Promise<unknown>): Promise<unknown> {
			await Task.create({ data: { label: 'a' } }, M)
			await Task.create({ data: { label: 'b' } }, M)
			const { rows } = await holder.query<{ id: string }>(
				`select "id" from "task" order by "id"`,
			)
			const low = rows[0]?.id
			// Rewritten, the lower id is now stored after the higher one.
			await holder.query(
				`update "task" set "label" = "label" where "id" = $1`,
				[low],
			)
			const stored = await holder.query<{ id: string }>(
				`select "id" from "task"`,
			)
			expect(stored.rows.at(-1)?.id).toBe(low)
			await holder.query('begin')
			await holder.query(`select 1 from "task" where "id" = $1 for update`, [
				low,
			])
			const pending = call()
			await waitingOnLock(watcher, 'task')
			await prober.query('begin')
			const free = await prober.query(
				`select 1 from "task" where "id" <> $1 for update nowait`,
				[low],
			)
			await prober.query('rollback')
			expect(free.rowCount).toBe(1)
			await holder.query('commit')
			return pending
		}

		it('updateMany waits on the first id without holding the next', async () => {
			const data = { label: 'c' }
			expect(await inOrder(async () => Task.updateMany({ data }, M))).toEqual({
				count: 2,
			})
		})

		it('deleteMany waits on the first id without holding the next', async () => {
			expect(await inOrder(async () => Task.deleteMany({}, M))).toEqual({
				count: 2,
			})
		})
	})
}
