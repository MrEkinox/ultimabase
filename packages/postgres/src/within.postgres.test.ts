// A relation kept within the row's parent on postgres() (D-220): the database
// keeps it too, so a write the kernel's checks could not see is refused at
// commit, with the kernel's issue.
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
		milestones: f.many(() => Milestone, { inverse: 'project' }),
		tasks: f.many(() => Task, { inverse: 'project' }),
		featured: f.one(() => Milestone, {
			optional: true,
			within: { project: 'id' },
		}),
	}),
})

const Milestone = defineModel({
	name: 'Milestone',
	fields: (f) => ({
		name: f.string(),
		project: f.one(() => Project),
		tasks: f.many(() => Task, { inverse: 'milestone' }),
		featuredIn: f.many(() => Project, { inverse: 'featured' }),
	}),
})

const Task = defineModel({
	name: 'Task',
	fields: (f) => ({
		name: f.string(),
		project: f.one(() => Project),
		milestone: f.one(() => Milestone, { optional: true, within: 'project' }),
	}),
})

const refused = (path: string, message: string) => ({
	code: 'VALIDATION_FAILED',
	details: { issues: [{ path: [path], message }] },
})
const task = 'Task.milestone needs a Milestone of the same project.'

/** Two projects, and a milestone of the first. */
async function seed() {
	const mine = await Project.create({ data: { name: 'mine' } }, M)
	const theirs = await Project.create({ data: { name: 'theirs' } }, M)
	const milestone = await Milestone.create(
		{ data: { name: 'm', project: { connect: { id: mine.id } } } },
		M,
	)
	return { mine: mine.id, theirs: theirs.id, milestone: milestone.id }
}

describe('a relation kept within its parent on postgres()', () => {
	testApplication(defineApp({ database, models: [Project, Milestone, Task] }), {
		database: 'declared',
	})

	it("keys the row's target and parent against the target's", async () => {
		const keys = await database.sql<{ name: string; definition: string }>`
			select conname as name, pg_get_constraintdef(oid) as definition
			from pg_constraint
			where connamespace = current_schema()::regnamespace
				and (conname like '%within%' or contype = 'u')
			order by conname`
		expect(keys).toStrictEqual([
			{
				name: 'milestone_id_project_id_key',
				definition: 'UNIQUE (id, project_id)',
			},
			{
				name: 'project_featured_id_within_fkey',
				definition:
					'FOREIGN KEY (featured_id, id) REFERENCES milestone(id, project_id) DEFERRABLE INITIALLY DEFERRED',
			},
			{
				name: 'task_milestone_id_within_fkey',
				definition:
					'FOREIGN KEY (milestone_id, project_id) REFERENCES milestone(id, project_id) DEFERRABLE INITIALLY DEFERRED',
			},
		])
	})

	it('refuses a link to a target a statement moved in the same transaction', async () => {
		const { mine, theirs, milestone } = await seed()
		await expect(
			transaction(async () => {
				await Task.create(
					{
						data: {
							name: 't',
							project: { connect: { id: mine } },
							milestone: { connect: { id: milestone } },
						},
					},
					M,
				)
				await database.sql`update milestone set project_id = ${theirs} where id = ${milestone}`
			}),
		).rejects.toMatchObject(refused('milestone', task))
		expect(await Task.count({}, M)).toBe(0)
	})

	it('refuses a move of a target a statement linked in the same transaction', async () => {
		const { mine, theirs, milestone } = await seed()
		await expect(
			transaction(async () => {
				await Milestone.update(
					{
						where: { id: milestone },
						data: { project: { connect: { id: theirs } } },
					},
					M,
				)
				await database.sql`insert into task (id, created_at, updated_at, name, project_id, milestone_id)
					values (gen_random_uuid(), now(), now(), 't', ${mine}, ${milestone})`
			}),
		).rejects.toMatchObject(refused('milestone', task))
	})

	it('keeps a relation within the row itself', async () => {
		const { mine, theirs, milestone } = await seed()
		await expect(
			transaction(async () => {
				await Project.update(
					{
						where: { id: mine },
						data: { featured: { connect: { id: milestone } } },
					},
					M,
				)
				await database.sql`update milestone set project_id = ${theirs} where id = ${milestone}`
			}),
		).rejects.toMatchObject(
			refused(
				'featured',
				'Project.featured needs a Milestone of the same project.',
			),
		)
		await Project.update(
			{
				where: { id: mine },
				data: { featured: { connect: { id: milestone } } },
			},
			M,
		)
		expect(
			await Project.findUnique(
				{ where: { id: mine }, select: { featured: { select: { id: true } } } },
				M,
			),
		).toStrictEqual({ featured: { id: milestone } })
	})
})
