// A user's update or delete that loads no row (D-342) racing an update that
// moves the row out of its rule's filter, on its own fields or through a
// relation: the filter is checked on the row as the lock wait leaves it, so
// the write is refused.
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { Logger } from 'ultimabase'
import { asUser } from '@ultimabase/testing'
import { PublicError, defineApp, defineModel, master } from 'ultimabase'
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
const ada = { as: asUser({ id: 'ada' }) }

const notOwner = new PublicError('NOT_OWNER', 'Only its owner.')
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ owner: f.string(), text: f.string() }),
}).with({
	access: {
		read: () => true,
		update: ({ caller, where }) =>
			caller.kind === 'user' &&
			where({ owner: { equals: caller.user.id } }, notOwner),
		delete: ({ caller, where }) =>
			caller.kind === 'user' &&
			where({ owner: { equals: caller.user.id } }, notOwner),
	},
})

const Project = defineModel({
	name: 'Project',
	fields: (f) => ({
		owner: f.string(),
		tasks: f.many(() => Task, { inverse: 'project' }),
	}),
}).with({ access: { read: () => true } })
const Task = defineModel({
	name: 'Task',
	fields: (f) => ({ title: f.string(), project: f.one(() => Project) }),
}).with({
	access: {
		read: () => true,
		update: ({ caller, where }) =>
			caller.kind === 'user' &&
			where(
				{ project: { is: { owner: { equals: caller.user.id } } } },
				notOwner,
			),
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

/** The move that gives a note to bob. */
const taken = (id: string) => ({
	table: 'note',
	sql: `update "note" set "owner" = 'bob' where "id" = $1`,
	id,
})

for (const url of urls) {
	describe(`a ruled write that races a move on ${url}`, () => {
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
				models: [Note, Project, Task],
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

		/** The outcome of `write`, which waits while `move` commits. */
		async function raced(
			move: { readonly table: string; readonly sql: string; id: string },
			write: () => Promise<unknown>,
		): Promise<unknown> {
			await other.query('begin')
			await other.query(move.sql, [move.id])
			const pending = write().catch((error: unknown) => error)
			await waitingOnLock(watcher, move.table)
			await other.query('commit')
			return pending
		}

		it('update: refuses a note that is no longer hers', async () => {
			const { id } = await Note.create({ data: { owner: 'ada', text: 't' } }, M)
			const outcome = await raced(taken(id), async () =>
				Note.update({ where: { id }, data: { text: 'u' } }, ada),
			)
			expect(outcome).toMatchObject({ code: 'NOT_OWNER' })
			const note = await Note.findUnique({ where: { id } }, M)
			expect(note).toMatchObject({ owner: 'bob', text: 't' })
		})

		it('delete: refuses a note that is no longer hers', async () => {
			const { id } = await Note.create({ data: { owner: 'ada', text: 't' } }, M)
			const outcome = await raced(taken(id), async () =>
				Note.delete({ where: { id } }, ada),
			)
			expect(outcome).toMatchObject({ code: 'NOT_OWNER' })
			expect(await Note.count({}, M)).toBe(1)
		})

		it('update: refuses a task moved to a project that is not hers', async () => {
			const project = async (owner: string) =>
				(await Project.create({ data: { owner } }, M)).id
			const [mine, theirs] = [await project('ada'), await project('bob')]
			const { id } = await Task.create(
				{ data: { title: 't', project: { connect: { id: mine } } } },
				M,
			)
			const moved = {
				table: 'task',
				sql: `update "task" set "project_id" = '${theirs}' where "id" = $1`,
				id,
			}
			const outcome = await raced(moved, async () =>
				Task.update({ where: { id }, data: { title: 'u' } }, ada),
			)
			expect(outcome).toMatchObject({ code: 'NOT_OWNER' })
			const task = await Task.findUnique({ where: { id } }, M)
			expect(task).toMatchObject({ title: 't' })
		})
	})
}
