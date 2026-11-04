// A write rule's filter on PostgreSQL (D-214): the check before the write
// runs in its statement, the check after it in its transaction, which a
// refusal rolls back.
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

const Project = defineModel({
	name: 'Project',
	fields: (f) => ({
		owner: f.string(),
		tasks: f.many(() => Task, { inverse: 'project' }),
	}),
}).with({
	access: {
		read: () => true,
		update: ({ caller, where }) =>
			caller.kind === 'user' && where({ owner: { equals: caller.user.id } }),
	},
})
// Ada writes the unlocked tasks of her projects.
const Task = defineModel({
	name: 'Task',
	fields: (f) => ({
		title: f.string(),
		locked: f.boolean({ default: false }),
		project: f.one(() => Project, { optional: true }),
	}),
}).with({
	access: {
		read: () => true,
		write: ({ caller, where }) =>
			caller.kind === 'user' &&
			where(
				{
					project: { is: { owner: { equals: caller.user.id } } },
					locked: { equals: false },
				},
				new PublicError('NOT_PROJECT_OWNER', 'Only the owner.'),
			),
	},
	hooks: { beforeDelete: async () => {} },
})

const refused = { code: 'NOT_PROJECT_OWNER' }
const into = (id: string) => ({ project: { connect: { id } } })
const titles = async () =>
	(await Task.findMany({ orderBy: { title: 'asc' } }, M)).map(
		(task) => task.title,
	)

for (const url of urls) {
	describe(`a write rule's filter on ${url}`, () => {
		let schema = ''
		let app: ReturnType<typeof defineApp>
		let ids: { mine: string; theirs: string; task: string; other: string }
		beforeEach(async () => {
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			const database = createAdapter({ url: inSchema(url, schema) })
			app = defineApp({ database, models: [Project, Task], logger: quiet })
			await app.start()
			const project = async (owner: string) =>
				(await Project.create({ data: { owner } }, M)).id
			const mine = await project('ada')
			const theirs = await project('bob')
			const task = async (id: string) =>
				(await Task.create({ data: { title: 't', ...into(id) } }, M)).id
			ids = { mine, theirs, task: await task(mine), other: await task(theirs) }
		})
		afterEach(async () => {
			await app.stop()
			await run(url, `drop schema "${schema}" cascade`)
		})

		it('checks an update before the write, in its statement', async () => {
			await expect(
				Task.update({ where: { id: ids.other }, data: { title: 'u' } }, ada),
			).rejects.toMatchObject(refused)
			await Task.update({ where: { id: ids.task }, data: { title: 'u' } }, ada)
			expect(await titles()).toEqual(['t', 'u'])
		})

		it('rolls an update back when the row leaves the filter', async () => {
			await expect(
				Task.update(
					{
						where: { id: ids.task },
						data: { title: 'u', ...into(ids.theirs) },
					},
					ada,
				),
			).rejects.toMatchObject(refused)
			await expect(
				Task.updateMany(
					{ where: { id: ids.task }, data: { title: 'u', locked: true } },
					ada,
				),
			).rejects.toMatchObject(refused)
			expect(await titles()).toEqual(['t', 't'])
		})

		it('rolls a create back when its row is outside the filter', async () => {
			await expect(
				Task.createMany(
					{
						data: [
							{ title: 'a', ...into(ids.mine) },
							{ title: 'b', ...into(ids.theirs) },
						],
					},
					ada,
				),
			).rejects.toMatchObject(refused)
			expect(await titles()).toEqual(['t', 't'])
		})

		it('refuses a deleteMany whole, and a move from the other side', async () => {
			await expect(Task.deleteMany({ where: {} }, ada)).rejects.toMatchObject(
				refused,
			)
			await expect(
				Project.update(
					{
						where: { id: ids.mine },
						data: { tasks: { connect: [{ id: ids.other }] } },
					},
					ada,
				),
			).rejects.toMatchObject(refused)
			expect(await Task.count({}, M)).toBe(2)
			const other = await Task.findUnique(
				{ where: { id: ids.other }, include: { project: true } },
				M,
			)
			expect(other?.project?.owner).toBe('bob')
		})
	})
}
