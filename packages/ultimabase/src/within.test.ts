// A relation kept within the row's parent on `memory()` (D-220): the start
// checks both sides, and each write that links a row, moves it, or moves its
// target is refused when they part.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineApp, defineModel, master, memory } from './index.ts'

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
		project: f.one(() => Project),
		tasks: f.many(() => Task, { inverse: 'milestone' }),
		goals: f.many(() => Goal, { inverse: 'milestone' }),
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
		featuredIn: f.many(() => Project, { inverse: 'featuredGoal' }),
	}),
})

const M = { as: master }
const refused = (path: string, message: string) => ({
	code: 'VALIDATION_FAILED',
	details: { issues: [{ path: [path], message }] },
})
const task = 'Task.milestone needs a Milestone of the same project.'
const featured = 'Project.featured needs a Milestone of the same project.'
const goal = 'Project.featuredGoal needs a Goal of the same milestone.'

let app: ReturnType<typeof defineApp>
let a: string
let b: string
let ma: string
let mb: string
let t: string

beforeEach(async () => {
	app = defineApp({
		database: memory(),
		models: [Project, Milestone, Task, Goal],
	})
	await app.start()
	a = (await Project.create({ data: { name: 'A' } }, M)).id
	b = (await Project.create({ data: { name: 'B' } }, M)).id
	const milestone = (id: string, name: string) =>
		Milestone.create({ data: { name, project: { connect: { id } } } }, M)
	ma = (await milestone(a, 'A1')).id
	mb = (await milestone(b, 'B1')).id
	const data = {
		name: 'T',
		project: { connect: { id: a } },
		milestone: { connect: { id: ma } },
	}
	t = (await Task.create({ data }, M)).id
})

afterEach(async () => app.stop())

const project = (id: string) => ({ connect: { id } })
const row = (milestone: string) => ({
	name: 'T',
	project: project(a),
	milestone: project(milestone),
})
const start = async (models: Parameters<typeof defineApp>[0]['models']) => {
	await app.stop()
	app = defineApp({ database: memory(), models })
	return app.start()
}

const goalOf = async (milestone: string) =>
	(await Goal.create({ data: { milestone: project(milestone) } }, M)).id
const feature = (featuredGoal: string) =>
	Project.update(
		{
			where: { id: a },
			data: { featured: project(ma), featuredGoal: project(featuredGoal) },
		},
		M,
	)

describe('a row linked to its target', () => {
	it('links a target of its parent, and refuses another', async () => {
		const made = await Task.create(
			{
				data: { name: 'T2', project: project(a), milestone: project(ma) },
				select: { milestone: { select: { name: true } } },
			},
			M,
		)
		expect(made.milestone).toEqual({ name: 'A1' })
		await expect(
			Task.create(
				{ data: { name: 'T3', project: project(a), milestone: project(mb) } },
				M,
			),
		).rejects.toMatchObject(refused('milestone', task))
		expect(await Task.count({}, M)).toBe(2)
	})

	it('leaves a missing target NOT_FOUND', async () => {
		const missing = '00000000-0000-7000-8000-000000000000'
		await expect(
			Task.create(
				{
					data: { name: 'T', project: project(a), milestone: project(missing) },
				},
				M,
			),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})

	it('holds nothing without a target', async () => {
		await Task.create({ data: { name: 'T', project: project(b) } }, M)
		await Task.update(
			{ where: { id: t }, data: { milestone: { disconnect: true } } },
			M,
		)
		await Task.update({ where: { id: t }, data: { project: project(b) } }, M)
		expect(
			await Task.findUnique(
				{ where: { id: t }, select: { project: { select: { id: true } } } },
				M,
			),
		).toStrictEqual({ project: { id: b } })
	})

	it('checks a nested create of the target on its data', async () => {
		const create = (id: string) => ({
			create: { name: 'New', project: project(id) },
		})
		await Task.create(
			{ data: { name: 'T', project: project(b), milestone: create(b) } },
			M,
		)
		await expect(
			Task.create(
				{ data: { name: 'T', project: project(b), milestone: create(a) } },
				M,
			),
		).rejects.toMatchObject(refused('milestone', task))
	})

	it('refuses a row moved away from its target, on the field written', async () => {
		await expect(
			Task.update({ where: { id: t }, data: { milestone: project(mb) } }, M),
		).rejects.toMatchObject(refused('milestone', task))
		await expect(
			Task.update({ where: { id: t }, data: { project: project(b) } }, M),
		).rejects.toMatchObject(refused('project', task))
		await Task.update(
			{
				where: { id: t },
				data: { project: project(b), milestone: project(mb) },
			},
			M,
		)
	})

	it('lets a row be written apart from its relation', async () => {
		const renamed = await Task.update(
			{ where: { id: t }, data: { name: 'Renamed' } },
			M,
		)
		expect(renamed.name).toBe('Renamed')
	})

	it('refuses a nested update of the row’s parent', async () => {
		const update = { where: { id: t }, data: { project: project(b) } }
		await expect(
			Milestone.update(
				{ where: { id: ma }, data: { tasks: { update: [update] } } },
				M,
			),
		).rejects.toMatchObject(refused('project', task))
	})

	it('refuses a nested update of the row', async () => {
		const update = { where: { id: t }, data: { milestone: project(mb) } }
		await expect(
			Project.update(
				{ where: { id: a }, data: { tasks: { update: [update] } } },
				M,
			),
		).rejects.toMatchObject(refused('milestone', task))
	})

	it('creates many rows, refusing them all for one', async () => {
		await Task.createMany({ data: [row(ma), row(ma)] }, M)
		await expect(
			Task.createMany({ data: [row(ma), row(mb)] }, M),
		).rejects.toMatchObject(refused('milestone', task))
		expect(await Task.count({}, M)).toBe(3)
	})
})

describe('a write on the other side', () => {
	it('refuses a target moved to another parent while a row links it', async () => {
		await expect(
			Milestone.update({ where: { id: ma }, data: { project: project(b) } }, M),
		).rejects.toMatchObject(refused('project', task))
		await Milestone.update(
			{ where: { id: mb }, data: { project: project(a) } },
			M,
		)
	})

	it('moves a target with the rows it leaves in the same write', async () => {
		const moved = (tasks: object) =>
			Milestone.update(
				{ where: { id: ma }, data: { project: project(b), tasks } },
				M,
			)
		await moved({ disconnect: [{ id: t }] })
		// A check reads the rows as they were: a target moved back, then linked.
		await Milestone.update(
			{ where: { id: ma }, data: { project: project(a) } },
			M,
		)
		await Task.update({ where: { id: t }, data: { milestone: project(ma) } }, M)
		await moved({ delete: [{ id: t }] })
		expect(await Task.count({}, M)).toBe(0)
	})

	it('refuses a target moved while the write updates its row', async () => {
		const update = { where: { id: t }, data: { name: 'Kept' } }
		await expect(
			Milestone.update(
				{
					where: { id: ma },
					data: { project: project(b), tasks: { update: [update] } },
				},
				M,
			),
		).rejects.toMatchObject(refused('project', task))
	})

	it('refuses a row the target connects', async () => {
		await expect(
			Milestone.update(
				{ where: { id: mb }, data: { tasks: { connect: [{ id: t }] } } },
				M,
			),
		).rejects.toMatchObject(refused('milestone', task))
	})

	it('reads a target the same write creates', async () => {
		const tasks = { connect: [{ id: t }] }
		await expect(
			Milestone.create({ data: { name: 'B2', project: project(b), tasks } }, M),
		).rejects.toMatchObject(refused('milestone', task))
		await Milestone.create(
			{ data: { name: 'A2', project: project(a), tasks } },
			M,
		)
	})

	it('refuses a row the parent connects', async () => {
		await expect(
			Project.update(
				{ where: { id: b }, data: { tasks: { connect: [{ id: t }] } } },
				M,
			),
		).rejects.toMatchObject(refused('project', task))
	})

	it('refuses a target the parent connects', async () => {
		await expect(
			Project.update(
				{ where: { id: b }, data: { milestones: { connect: [{ id: ma }] } } },
				M,
			),
		).rejects.toMatchObject(refused('project', task))
	})

	it('lets a target with rows be deleted, emptying them', async () => {
		await Milestone.delete({ where: { id: ma } }, M)
		const found = await Task.findUnique(
			{ where: { id: t }, select: { milestone: true } },
			M,
		)
		expect(found?.milestone).toBeNull()
	})
})

describe('within the row itself', () => {
	it('links one of its own targets', async () => {
		await Project.update(
			{ where: { id: a }, data: { featured: project(ma) } },
			M,
		)
		await expect(
			Project.update({ where: { id: a }, data: { featured: project(mb) } }, M),
		).rejects.toMatchObject(refused('featured', featured))
	})

	it('refuses a row the target connects', async () => {
		await expect(
			Milestone.update(
				{ where: { id: ma }, data: { featuredIn: { connect: [{ id: b }] } } },
				M,
			),
		).rejects.toMatchObject(refused('featured', featured))
		await Milestone.update(
			{ where: { id: ma }, data: { featuredIn: { connect: [{ id: a }] } } },
			M,
		)
	})

	it('refuses its target moved to another parent', async () => {
		await Project.update(
			{ where: { id: a }, data: { featured: project(ma) } },
			M,
		)
		await expect(
			Milestone.update({ where: { id: ma }, data: { project: project(b) } }, M),
		).rejects.toMatchObject(refused('project', featured))
	})
})

describe('within a field of another name', () => {
	it('links a target of the row’s featured milestone', async () => {
		const mine = await Goal.create({ data: { milestone: project(ma) } }, M)
		const theirs = await Goal.create({ data: { milestone: project(mb) } }, M)
		await Project.update(
			{
				where: { id: a },
				data: { featured: project(ma), featuredGoal: project(mine.id) },
			},
			M,
		)
		await expect(
			Project.update(
				{ where: { id: a }, data: { featuredGoal: project(theirs.id) } },
				M,
			),
		).rejects.toMatchObject(refused('featuredGoal', goal))
		await expect(
			Goal.update(
				{ where: { id: mine.id }, data: { milestone: project(mb) } },
				M,
			),
		).rejects.toMatchObject(refused('milestone', goal))
	})
})

describe('a row whose parent is unset', () => {
	it('links no target', async () => {
		const mine = await goalOf(ma)
		await expect(
			Project.update(
				{ where: { id: a }, data: { featuredGoal: project(mine) } },
				M,
			),
		).rejects.toMatchObject(refused('featuredGoal', goal))
		await expect(
			Project.create({ data: { name: 'C', featuredGoal: project(mine) } }, M),
		).rejects.toMatchObject(refused('featuredGoal', goal))
	})

	it('refuses a target its parent connects', async () => {
		const mine = await goalOf(ma)
		await expect(
			Goal.update(
				{ where: { id: mine }, data: { featuredIn: { connect: [{ id: b }] } } },
				M,
			),
		).rejects.toMatchObject(refused('featuredGoal', goal))
	})

	it('refuses its parent emptied while a target is linked', async () => {
		await feature(await goalOf(ma))
		await expect(
			Project.update(
				{ where: { id: a }, data: { featured: { disconnect: true } } },
				M,
			),
		).rejects.toMatchObject(refused('featured', goal))
		await expect(
			Milestone.update(
				{
					where: { id: ma },
					data: { featuredIn: { disconnect: [{ id: a }] } },
				},
				M,
			),
		).rejects.toMatchObject(refused('featured', goal))
		await Project.update(
			{
				where: { id: a },
				data: {
					featured: { disconnect: true },
					featuredGoal: { disconnect: true },
				},
			},
			M,
		)
	})

	it('lets a parent be emptied with no target', async () => {
		await Project.update(
			{ where: { id: a }, data: { featured: project(ma) } },
			M,
		)
		await Milestone.update(
			{ where: { id: ma }, data: { featuredIn: { disconnect: [{ id: a }] } } },
			M,
		)
		const found = await Project.findUnique(
			{ where: { id: a }, select: { featured: true } },
			M,
		)
		expect(found?.featured).toBeNull()
	})

	it('lets the parent be deleted, emptying the target first', async () => {
		await feature(await goalOf(ma))
		await Milestone.delete({ where: { id: ma } }, M)
		const found = await Project.findUnique(
			{ where: { id: a }, select: { featured: true, featuredGoal: true } },
			M,
		)
		expect(found).toEqual({ featured: null, featuredGoal: null })
	})

	it('lets another row’s write delete the parent', async () => {
		await feature(await goalOf(ma))
		await Task.update(
			{ where: { id: t }, data: { milestone: { delete: true } } },
			M,
		)
		const found = await Project.findUnique(
			{ where: { id: a }, select: { featured: true, featuredGoal: true } },
			M,
		)
		expect(found).toEqual({ featured: null, featuredGoal: null })
	})
})

describe('at start', () => {
	it('needs a required one relation on the target to the same parent', async () => {
		const Team = defineModel({
			name: 'Team',
			fields: (f) => ({
				boards: f.many(() => Board, { inverse: 'team' }),
				cards: f.many(() => Card, { inverse: 'team' }),
			}),
		})
		const Board = defineModel({
			name: 'Board',
			fields: (f) => ({
				team: f.one(() => Team, { optional: true }),
				cards: f.many(() => Card, { inverse: 'board' }),
			}),
		})
		const Card = defineModel({
			name: 'Card',
			fields: (f) => ({
				team: f.one(() => Team),
				board: f.one(() => Board, { within: 'team' }),
			}),
		})
		await expect(start([Team, Board, Card])).rejects.toThrow(
			'Card.board: within names team, a required one relation of Board to Team.',
		)
	})

	it('needs a one relation of the row', async () => {
		const Box = defineModel({
			name: 'Box',
			fields: (f) => ({
				label: f.string(),
				// @ts-expect-error -- names no one relation of the row
				lid: f.one(() => Lid, { within: { box: 'label' } }),
			}),
		})
		const Lid = defineModel({
			name: 'Lid',
			fields: (f) => ({ boxes: f.many(() => Box, { inverse: 'lid' }) }),
		})
		await expect(start([Box, Lid])).rejects.toThrow(
			'Box.lid: within names label, a one relation of Box.',
		)
	})

	it('takes one pair, on the side that stores the key', async () => {
		const pair = (within: { readonly [field: string]: 'id' }) => {
			const Shelf = defineModel({
				name: 'Shelf',
				fields: (f) => ({
					book: f.one(() => Book, { optional: true, within }),
					books: f.many(() => Book, { inverse: 'shelf' }),
				}),
			})
			const Book = defineModel({
				name: 'Book',
				fields: (f) => ({
					shelf: f.one(() => Shelf),
					picks: f.many(() => Shelf, { inverse: 'book' }),
				}),
			})
			return start([Shelf, Book])
		}
		await expect(pair({})).rejects.toThrow(
			'Shelf.book: within names one pair, a field of the target and id or a field of the row.',
		)
		await expect(pair({ shelf: 'id', picks: 'id' })).rejects.toThrow(
			'Shelf.book: within names one pair',
		)
		const Seat = defineModel({
			name: 'Seat',
			fields: (f) => ({
				room: f.one(() => Room),
				guest: f.one(() => Guest, {
					inverse: 'seat',
					optional: true,
					within: 'room',
				}),
			}),
		})
		const Guest = defineModel({
			name: 'Guest',
			fields: (f) => ({ seat: f.one(() => Seat), room: f.one(() => Room) }),
		})
		const Room = defineModel({
			name: 'Room',
			fields: (f) => ({
				seats: f.many(() => Seat, { inverse: 'room' }),
				guests: f.many(() => Guest, { inverse: 'room' }),
			}),
		})
		await expect(start([Seat, Guest, Room])).rejects.toThrow(
			'Seat.guest: within belongs on Guest.seat, which stores the key.',
		)
	})

	it('types the row’s side', async () => {
		const Owner = defineModel({
			name: 'Owner',
			fields: (f) => ({
				items: f.many(() => Item, { inverse: 'owner' }),
				bads: f.many(() => Bad, { inverse: 'owner' }),
			}),
		})
		const Item = defineModel({
			name: 'Item',
			fields: (f) => ({
				owner: f.one(() => Owner),
				bads: f.many(() => Bad, { inverse: 'pick' }),
			}),
		})
		const Bad = defineModel({
			name: 'Bad',
			fields: (f) => ({
				owner: f.one(() => Owner),
				// @ts-expect-error -- names a field the model lacks
				pick: f.one(() => Item, { within: 'projet' }),
			}),
		})
		await expect(start([Owner, Item, Bad])).rejects.toThrow(
			'Bad.pick: within names projet, a one relation of Bad.',
		)
	})

	it('types the target’s side on the application (#176)', async () => {
		const Org = defineModel({
			name: 'Org',
			fields: (f) => ({
				teams: f.many(() => Team, { inverse: 'org' }),
				tickets: f.many(() => Ticket, { inverse: 'org' }),
			}),
		})
		const Team = defineModel({
			name: 'Team',
			fields: (f) => ({
				org: f.one(() => Org),
				tickets: f.many(() => Ticket, { inverse: 'team' }),
				reviews: f.many(() => Ticket, { inverse: 'reviewer' }),
			}),
		})
		const Ticket = defineModel({
			name: 'Ticket',
			fields: (f) => ({
				org: f.one(() => Org),
				owner: f.one(() => Org),
				team: f.one(() => Team, { optional: true, within: 'owner' }),
				reviewer: f.one(() => Team, {
					optional: true,
					within: { orgn: 'org' },
				}),
			}),
		})
		// @ts-expect-error -- Team has no owner, nor orgn
		const ticketing = defineApp({
			database: memory(),
			models: [Org, Team, Ticket],
		})
		await expect(ticketing.start()).rejects.toThrow(
			'Ticket.team: within names owner, a required one relation of Team to Org.',
		)
	})
})
