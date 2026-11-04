// A relation kept within the row's parent on postgres() (D-220): the database
// keeps it too, so a write the kernel's checks could not see is refused at
// commit, with the kernel's issue.
import { testApplication } from '@ultimabase/testing'
import { defineApp, defineModel, master, transaction } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { Client } from 'pg'
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
		tasks: f.many(() => Task),
		featured: f.one(() => Milestone, {
			optional: true,
			inverse: 'featuredIn',
			within: { project: 'id' },
		}),
		featuredGoal: f.one(() => Goal, {
			optional: true,
			within: { milestone: 'featured' },
		}),
	}),
})

const Milestone = defineModel({
	name: 'Milestone',
	fields: (f) => ({
		name: f.string(),
		project: f.one(() => Project, { inverse: 'milestones' }),
		tasks: f.many(() => Task),
		goals: f.many(() => Goal),
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

const Goal = defineModel({
	name: 'Goal',
	fields: (f) => ({
		milestone: f.one(() => Milestone, { onDelete: 'cascade' }),
		featuredIn: f.many(() => Project),
	}),
})

const refused = (path: string, message: string) => ({
	code: 'VALIDATION_FAILED',
	details: { issues: [{ path: [path], message }] },
})
const task = 'Task.milestone needs a Milestone of the same project.'

/** Waits until a statement waits on a lock `holder` holds. */
async function blocking(holder: Client): Promise<void> {
	const { rows: held } = await holder.query<{ pid: number }>(
		'select pg_backend_pid() as pid',
	)
	const watcher = new Client({ connectionString: server })
	await watcher.connect()
	try {
		for (let tries = 0; tries < 300; tries += 1) {
			const { rows } = await watcher.query<{ n: number }>(
				`select count(*)::int as n from pg_stat_activity
				 where $1 = any(pg_blocking_pids(pid))`,
				[held[0]?.pid],
			)
			if ((rows[0]?.n ?? 0) > 0) return
			await new Promise((resolve) => setTimeout(resolve, 10))
		}
	} finally {
		await watcher.end()
	}
	throw new Error('The write never waited on the row lock.')
}

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
	testApplication(
		defineApp({ database, models: [Project, Milestone, Task, Goal] }),
		{
			database: 'declared',
		},
	)

	it("keys the row's target and parent against the target's", async () => {
		const keys = await database.sql<{ name: string; definition: string }>`
			select conname as name, pg_get_constraintdef(oid) as definition
			from pg_constraint
			where connamespace = current_schema()::regnamespace
				and (conname like '%within%' or contype = 'u')
			order by conname`
		expect(keys).toStrictEqual([
			{
				name: 'goal_id_milestone_id_key',
				definition: 'UNIQUE (id, milestone_id)',
			},
			{
				name: 'milestone_id_project_id_key',
				definition: 'UNIQUE (id, project_id)',
			},
			{
				name: 'project_featured_goal_id_within_check',
				definition:
					'CHECK (((featured_id IS NOT NULL) OR (featured_goal_id IS NULL)))',
			},
			{
				name: 'project_featured_goal_id_within_fkey',
				definition:
					'FOREIGN KEY (featured_goal_id, featured_id) REFERENCES goal(id, milestone_id) DEFERRABLE INITIALLY DEFERRED',
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

	it('empties a target before the parent a delete empties', async () => {
		const { mine, milestone } = await seed()
		const goal = await Goal.create(
			{ data: { milestone: { connect: { id: milestone } } } },
			M,
		)
		await Project.update(
			{
				where: { id: mine },
				data: {
					featured: { connect: { id: milestone } },
					featuredGoal: { connect: { id: goal.id } },
				},
			},
			M,
		)
		await Milestone.delete({ where: { id: milestone } }, M)
		expect(
			await Project.findUnique(
				{ where: { id: mine }, select: { featured: true, featuredGoal: true } },
				M,
			),
		).toStrictEqual({ featured: null, featuredGoal: null })
	})

	it('refuses a parent emptied while a statement links a target', async () => {
		const { mine, milestone } = await seed()
		const goal = await Goal.create(
			{ data: { milestone: { connect: { id: milestone } } } },
			M,
		)
		await Project.update(
			{
				where: { id: mine },
				data: { featured: { connect: { id: milestone } } },
			},
			M,
		)
		const [{ schema } = { schema: '' }] = await database.sql<{
			schema: string
		}>`
			select current_schema() as schema`
		const options = encodeURIComponent(`-c search_path=${schema}`)
		const other = new Client({
			connectionString: `${server}?options=${options}`,
		})
		await other.connect()
		try {
			// The kernel counts no linked target, then waits on the row's lock.
			await other.query('begin')
			await other.query(
				'update project set featured_goal_id = $1 where id = $2',
				[goal.id, mine],
			)
			const emptied = Milestone.update(
				{
					where: { id: milestone },
					data: { featuredIn: { disconnect: [{ id: mine }] } },
				},
				M,
			)
			await blocking(other)
			await other.query('commit')
			await expect(emptied).rejects.toMatchObject(
				refused(
					'featuredGoal',
					'Project.featuredGoal needs a Goal of the same milestone.',
				),
			)
		} finally {
			await other.end()
		}
	})
})
