// A write racing another transaction that inserts the same unique value: it
// waits on that row, then fails as the kernel's UNIQUE_VIOLATION once the
// other commits, never as PostgreSQL's raw error.
import { randomUUID } from 'node:crypto'
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
const taken = {
	code: 'UNIQUE_VIOLATION',
	details: { model: 'Member', fields: ['code'] },
}

const Club = defineModel({ name: 'Club', fields: () => ({}) })
const Member = defineModel({
	name: 'Member',
	fields: (f) => ({ code: f.string({ unique: true }) }),
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
	describe(`a write that races a unique insert on ${url}`, () => {
		let schema = ''
		let app: ReturnType<typeof defineApp>
		let other: Client
		let watcher: Client
		beforeEach(async () => {
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			const database = createAdapter({ url: inSchema(url, schema) })
			app = defineApp({ database, models: [Club, Member], logger: quiet })
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

		/** Inserts a member coded `code`, committed once `write` waits on it. */
		async function raced(write: () => Promise<unknown>): Promise<unknown> {
			await other.query('begin')
			await other.query(
				`insert into "member" ("id", "code", "created_at", "updated_at")
				 values ($1, 'c', now(), now())`,
				[randomUUID()],
			)
			const pending = write().catch((error: unknown) => error)
			await waitingOnLock(watcher, 'member')
			await other.query('commit')
			return pending
		}

		it('create: fails as a unique violation', async () => {
			const outcome = await raced(async () =>
				Member.create({ data: { code: 'c' } }, M),
			)
			expect(outcome).toMatchObject(taken)
		})

		it('update: fails as a unique violation', async () => {
			const member = await Member.create({ data: { code: 'd' } }, M)
			const outcome = await raced(async () =>
				Member.update({ where: { id: member.id }, data: { code: 'c' } }, M),
			)
			expect(outcome).toMatchObject(taken)
			expect(await Member.count({ where: { code: 'd' } }, M)).toBe(1)
		})

		it('a create in a transaction: fails as a unique violation', async () => {
			const outcome = await raced(async () =>
				transaction(async () => {
					await Club.create({ data: {} }, M)
					await Member.create({ data: { code: 'c' } }, M)
				}),
			)
			expect(outcome).toMatchObject(taken)
			expect(await Club.count({}, M)).toBe(0)
		})
	})
}
