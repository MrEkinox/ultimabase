// A many-to-many kept within the row's parent on postgres() (D-236): the join
// holds the parent, which each link takes from its row and a row moved
// carries, so a link outside it is refused at commit, with the kernel's issue.
import { testApplication } from '@ultimabase/testing'
import { defineApp, defineModel, master, transaction } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
const database = createAdapter({ url: server })

const Project = defineModel({
	name: 'Project',
	fields: (f) => ({
		name: f.string(),
		notes: f.many(() => Note),
		tasks: f.many(() => Task),
	}),
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		project: f.one(() => Project, { onDelete: 'cascade' }),
		tasks: f.many(() => Task, { inverse: 'notes', within: 'project' }),
	}),
})

const Task = defineModel({
	name: 'Task',
	fields: (f) => ({
		name: f.string(),
		project: f.one(() => Project, { onDelete: 'cascade' }),
		notes: f.many(() => Note),
	}),
})

const refused = {
	code: 'VALIDATION_FAILED',
	details: {
		issues: [
			{
				path: ['tasks'],
				message: 'Note.tasks needs a Task of the same project.',
			},
		],
	},
}

const project = (id: string) => ({ connect: { id } })
const ids = (...each: string[]) => each.map((id) => ({ id }))

/** Two projects, a note and a task of the first, a task of the second. */
async function seed() {
	const a = (await Project.create({ data: { name: 'a' } }, M)).id
	const b = (await Project.create({ data: { name: 'b' } }, M)).id
	const note = (await Note.create({ data: { project: project(a) } }, M)).id
	const task = (id: string) =>
		Task.create({ data: { name: 't', project: project(id) } }, M)
	return { a, b, note, mine: (await task(a)).id, theirs: (await task(b)).id }
}

/** Each link's note, task and parent. */
const links = () =>
	database.sql<{ note: string; task: string; project: string }>`
		select note_id as note, task_id as task, project_id as project
		from note_tasks order by task_id`

describe('a many-to-many kept within its parent on postgres()', () => {
	testApplication(defineApp({ database, models: [Project, Note, Task] }), {
		database: 'declared',
	})

	it("keys each side's row and parent against the link's", async () => {
		const keys = await database.sql<{ name: string; definition: string }>`
			select conname as name, pg_get_constraintdef(oid) as definition
			from pg_constraint
			where connamespace = current_schema()::regnamespace
				and (conname like '%within%' or contype = 'u')
			order by conname`
		expect(keys).toStrictEqual([
			{
				name: 'note_id_project_id_key',
				definition: 'UNIQUE (id, project_id)',
			},
			{
				name: 'note_tasks_note_id_within_fkey',
				definition:
					'FOREIGN KEY (note_id, project_id) REFERENCES note(id, project_id) ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED',
			},
			{
				name: 'note_tasks_task_id_within_fkey',
				definition:
					'FOREIGN KEY (task_id, project_id) REFERENCES task(id, project_id) ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED',
			},
			{
				name: 'task_id_project_id_key',
				definition: 'UNIQUE (id, project_id)',
			},
		])
	})

	it('gives each link the parent of the rows a write creates', async () => {
		const { a, note, mine } = await seed()
		const made = await Note.create(
			{
				data: {
					project: project(a),
					tasks: {
						connect: ids(mine),
						create: [{ name: 't', project: project(a) }],
					},
				},
			},
			M,
		)
		await Task.create(
			{
				data: { name: 't', project: project(a), notes: { connect: ids(note) } },
			},
			M,
		)
		const all = await links()
		expect(all.map((link) => link.project)).toStrictEqual([a, a, a])
		expect(all.filter((link) => link.note === made.id)).toHaveLength(2)
	})

	it('carries the links of the rows a write moves', async () => {
		const { b, note, mine, theirs } = await seed()
		await Note.update(
			{ where: { id: note }, data: { tasks: { connect: ids(mine) } } },
			M,
		)
		await Note.update(
			{
				where: { id: note },
				data: {
					project: project(b),
					tasks: {
						update: [{ where: { id: mine }, data: { project: project(b) } }],
					},
				},
			},
			M,
		)
		expect(await links()).toStrictEqual([{ note, task: mine, project: b }])
		const other = (await Project.create({ data: { name: 'c' } }, M)).id
		await Note.update(
			{
				where: { id: note },
				data: { project: project(other), tasks: { set: [] } },
			},
			M,
		)
		await Task.update(
			{ where: { id: theirs }, data: { project: project(other) } },
			M,
		)
		// The link takes the row's parent before the statement moves it.
		await Note.update(
			{
				where: { id: note },
				data: { project: project(b), tasks: { set: ids(mine) } },
			},
			M,
		)
		expect(await links()).toStrictEqual([{ note, task: mine, project: b }])
	})

	it('refuses at commit a link a statement moved outside its parent', async () => {
		const { b, note, mine } = await seed()
		await expect(
			transaction(async () => {
				await Note.update(
					{ where: { id: note }, data: { tasks: { connect: ids(mine) } } },
					M,
				)
				await database.sql`update task set project_id = ${b} where id = ${mine}`
			}),
		).rejects.toMatchObject(refused)
		expect(await links()).toStrictEqual([])
	})
})
