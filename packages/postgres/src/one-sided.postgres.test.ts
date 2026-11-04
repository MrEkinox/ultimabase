// A many-to-many declared on one side on postgres() (D-248): its join is
// named after the side declared, keeps its rows within their parent, and
// loses a row's links when either row is deleted.
import { testApplication } from '@ultimabase/testing'
import { defineApp, defineModel, master } from 'ultimabase'
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
	fields: (f) => ({ name: f.string() }),
})

const Membership = defineModel({
	name: 'Membership',
	fields: (f) => ({
		name: f.string(),
		project: f.one(() => Project, { onDelete: 'cascade' }),
	}),
})

const Task = defineModel({
	name: 'Task',
	fields: (f) => ({
		name: f.string(),
		project: f.one(() => Project, { onDelete: 'cascade' }),
		assignees: f.many(() => Membership, {
			inverse: false,
			within: 'project',
		}),
	}),
})

const Person = defineModel({
	name: 'Person',
	fields: (f) => ({
		name: f.string(),
		follows: f.many(() => Person, { inverse: false }),
	}),
})

const ids = (...each: string[]) => each.map((id) => ({ id }))
const inside = (id: string) => ({ connect: { id } })
const project = async () =>
	(await Project.create({ data: { name: 'P' } }, M)).id
const member = async (name: string, at: string) =>
	(await Membership.create({ data: { name, project: inside(at) } }, M)).id

/** The columns of the join tables. */
const columns = () =>
	database.sql<{ table: string; column: string }>`
		select table_name as table, column_name as column
		from information_schema.columns
		where table_schema = current_schema()
			and table_name in ('task_assignees', 'person_follows')
		order by table_name, column_name`

describe('a many declared on one side on postgres()', () => {
	testApplication(
		defineApp({ database, models: [Project, Membership, Task, Person] }),
		{ database: 'declared' },
	)

	it('keeps a join named after the side declared', async () => {
		expect(await columns()).toStrictEqual([
			{ table: 'person_follows', column: 'follows_id' },
			{ table: 'person_follows', column: 'person_id' },
			{ table: 'task_assignees', column: 'membership_id' },
			{ table: 'task_assignees', column: 'project_id' },
			{ table: 'task_assignees', column: 'task_id' },
		])
	})

	it('links, filters and drops the links of a row deleted', async () => {
		const at = await project()
		const ann = await member('Ann', at)
		const bob = await member('Bob', at)
		const task = (
			await Task.create(
				{
					data: {
						name: 'T',
						project: inside(at),
						assignees: { connect: ids(ann, bob) },
					},
				},
				M,
			)
		).id
		await Task.create({ data: { name: 'U', project: inside(at) } }, M)
		const found = await Task.findMany(
			{
				where: { assignees: { some: { name: 'Ann' } } },
				select: { name: true, _count: { select: { assignees: true } } },
			},
			M,
		)
		expect(found).toStrictEqual([{ name: 'T', _count: { assignees: 2 } }])
		await Membership.delete({ where: { id: ann } }, M)
		const read = await Task.findUnique(
			{
				where: { id: task },
				select: { assignees: { select: { name: true } } },
			},
			M,
		)
		expect(read).toStrictEqual({ assignees: [{ name: 'Bob' }] })
		await Task.delete({ where: { id: task } }, M)
		await expect(
			database.sql`select * from task_assignees`,
		).resolves.toStrictEqual([])
		await expect(Membership.count({}, M)).resolves.toBe(1)
	})

	it('keeps its rows within their parent', async () => {
		const at = await project()
		const stranger = await member('Dan', await project())
		const task = await Task.create(
			{ data: { name: 'T', project: inside(at) } },
			M,
		)
		await expect(
			Task.update(
				{
					where: { id: task.id },
					data: { assignees: { connect: ids(stranger) } },
				},
				M,
			),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	})

	it('relates a model to itself', async () => {
		const a = (await Person.create({ data: { name: 'A' } }, M)).id
		const b = (await Person.create({ data: { name: 'B' } }, M)).id
		await Person.update(
			{ where: { id: a }, data: { follows: { connect: ids(b) } } },
			M,
		)
		await expect(
			database.sql`select person_id, follows_id from person_follows`,
		).resolves.toStrictEqual([{ person_id: a, follows_id: b }])
		const followed = await Person.findMany(
			{ where: { follows: { some: { name: 'B' } } }, select: { name: true } },
			M,
		)
		expect(followed).toStrictEqual([{ name: 'A' }])
	})
})
