// A many-to-many `disconnect` racing a transaction that hides its target
// from `beforeFind` while the write waits on the row it updates.
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
const open = { read: () => true, update: () => true }

const Club = defineModel({
	name: 'Club',
	fields: (f) => ({ label: f.string(), members: f.many(() => Member) }),
}).with({ access: open })
const Member = defineModel({
	name: 'Member',
	fields: (f) => ({
		archived: f.boolean({ default: false }),
		clubs: f.many(() => Club),
	}),
}).with({
	access: open,
	hooks: { beforeFind: ({ where }) => where({ archived: false }) },
})

async function waitingOnLock(
	watcher: Client,
	tables: readonly string[],
): Promise<void> {
	for (let tries = 0; tries < 300; tries += 1) {
		const { rows } = await watcher.query<{ n: number }>(
			`select count(*)::int as n from pg_stat_activity
			 where wait_event_type = 'Lock' and query ilike any($1)`,
			[tables.map((table) => `%"${table}"%`)],
		)
		if ((rows[0]?.n ?? 0) > 0) return
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error('The write never waited on the row lock.')
}

for (const url of urls) {
	describe(`a disconnect that races a hiding write on ${url}`, () => {
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

		async function links(): Promise<number> {
			const { rows } = await other.query<{ name: string }>(
				`select table_name as name from information_schema.tables
				 where table_schema = $1 and table_name like '%club%member%'
				 or table_schema = $1 and table_name like '%member%club%'`,
				[schema],
			)
			const name = rows[0]?.name ?? 'missing'
			const counted = await other.query<{ n: number }>(
				`select count(*)::int as n from "${name}"`,
			)
			return counted.rows[0]?.n ?? -1
		}

		for (const [label, as] of [
			['master', M],
			['a user', { as: asUser({ id: randomUUID() }) }],
		] as const) {
			it(`by ${label}: leaves a member hidden while it waited`, async () => {
				const club = await Club.create({ data: { label: 'a' } }, M)
				const member = await Member.create(
					{ data: { clubs: { connect: [{ id: club.id }] } } },
					M,
				)
				expect(await links()).toBe(1)
				await other.query('begin')
				await other.query(
					`update "member" set "archived" = true where "id" = $1`,
					[member.id],
				)
				await other.query(`update "club" set "label" = 'b' where "id" = $1`, [
					club.id,
				])
				const pending = Club.update(
					{
						where: { id: club.id },
						data: { members: { disconnect: [{ id: member.id }] } },
					},
					as,
				).catch((error: unknown) => error)
				// On the club's lock, or on the member's when the write reads it locked.
				await waitingOnLock(watcher, ['club', 'member'])
				await other.query('commit')
				await pending
				// Hidden once the write could go on: the write does not reach it.
				expect(await links()).toBe(1)
			})
		}
	})
}
