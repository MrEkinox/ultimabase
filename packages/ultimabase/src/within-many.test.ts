// A many-to-many kept within the row's parent on `memory()` (D-236): the
// start checks the field both models share, and each write that links two
// rows, from either side, or moves a linked row is refused when they part.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineApp, defineModel, master, memory } from './index.ts'

const Project = defineModel({
	name: 'Project',
	fields: (f) => ({
		name: f.string(),
		notes: f.many(() => Note, { inverse: 'project' }),
		tasks: f.many(() => Task, { inverse: 'project' }),
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
		project: f.one(() => Project),
		notes: f.many(() => Note, { inverse: 'tasks' }),
		labels: f.many(() => Label, { inverse: 'tasks' }),
	}),
})

const Label = defineModel({
	name: 'Label',
	fields: (f) => ({ tasks: f.many(() => Task, { inverse: 'labels' }) }),
})

const M = { as: master }
const refused = (path: string) => ({
	code: 'VALIDATION_FAILED',
	details: {
		issues: [
			{ path: [path], message: 'Note.tasks needs a Task of the same project.' },
		],
	},
})

let app: ReturnType<typeof defineApp>
let a: string
let b: string
let note: string
let mine: string
let theirs: string

const project = (id: string) => ({ connect: { id } })
const ids = (...each: string[]) => each.map((id) => ({ id }))

beforeEach(async () => {
	app = defineApp({ database: memory(), models: [Project, Note, Task, Label] })
	await app.start()
	a = (await Project.create({ data: { name: 'A' } }, M)).id
	b = (await Project.create({ data: { name: 'B' } }, M)).id
	note = (await Note.create({ data: { project: project(a) } }, M)).id
	const task = (id: string) =>
		Task.create({ data: { name: 'T', project: project(id) } }, M)
	mine = (await task(a)).id
	theirs = (await task(b)).id
})

afterEach(async () => app.stop())

const linked = async () =>
	(
		await Note.findUnique(
			{ where: { id: note }, select: { tasks: { select: { id: true } } } },
			M,
		)
	)?.tasks.map(({ id }) => id)

const start = async (models: Parameters<typeof defineApp>[0]['models']) => {
	await app.stop()
	app = defineApp({ database: memory(), models })
	return app.start()
}

describe('a many-to-many kept within its parent', () => {
	it('links rows of one parent, from either side, and refuses others', async () => {
		const connect = (...tasks: string[]) =>
			Note.update(
				{ where: { id: note }, data: { tasks: { connect: ids(...tasks) } } },
				M,
			)
		await expect(connect(mine, theirs)).rejects.toMatchObject(refused('tasks'))
		await connect(mine)
		await expect(
			Task.update(
				{ where: { id: theirs }, data: { notes: { connect: ids(note) } } },
				M,
			),
		).rejects.toMatchObject(refused('notes'))
		await expect(
			Note.update(
				{ where: { id: note }, data: { tasks: { set: ids(theirs) } } },
				M,
			),
		).rejects.toMatchObject(refused('tasks'))
		expect(await linked()).toEqual([mine])
	})

	it('compares the rows a write creates', async () => {
		await expect(
			Note.create(
				{ data: { project: project(a), tasks: { connect: ids(theirs) } } },
				M,
			),
		).rejects.toMatchObject(refused('tasks'))
		await expect(
			Note.create(
				{
					data: {
						project: project(a),
						tasks: { create: [{ name: 'T', project: project(b) }] },
					},
				},
				M,
			),
		).rejects.toMatchObject(refused('tasks'))
		const made = await Task.create(
			{
				data: { name: 'T', project: project(a), notes: { connect: ids(note) } },
				select: { notes: { select: { id: true } } },
			},
			M,
		)
		expect(made.notes).toEqual(ids(note))
		await Note.create(
			{
				data: {
					project: project(a),
					tasks: { create: [{ name: 'T', project: project(a) }] },
				},
			},
			M,
		)
		expect(await Note.count({}, M)).toBe(2)
	})

	it('refuses a parent change that leaves a link across two, on either side', async () => {
		await Note.update(
			{ where: { id: note }, data: { tasks: { connect: ids(mine) } } },
			M,
		)
		await expect(
			Task.update({ where: { id: mine }, data: { project: project(b) } }, M),
		).rejects.toMatchObject(refused('project'))
		await expect(
			Note.update({ where: { id: note }, data: { project: project(b) } }, M),
		).rejects.toMatchObject(refused('project'))
		await expect(
			Note.update(
				{
					where: { id: note },
					data: {
						tasks: {
							update: [{ where: { id: mine }, data: { project: project(b) } }],
						},
					},
				},
				M,
			),
		).rejects.toMatchObject(refused('project'))
		expect(await linked()).toEqual([mine])
	})

	it('moves a row with the links the write removes or follows', async () => {
		await Note.update(
			{ where: { id: note }, data: { tasks: { connect: ids(mine) } } },
			M,
		)
		await Note.update(
			{
				where: { id: note },
				data: { project: project(b), tasks: { set: ids(theirs) } },
			},
			M,
		)
		expect(await linked()).toEqual([theirs])
		await Task.update(
			{
				where: { id: theirs },
				data: { project: project(a), notes: { disconnect: ids(note) } },
			},
			M,
		)
		expect(await linked()).toEqual([])
		await Task.update(
			{ where: { id: theirs }, data: { project: project(b) } },
			M,
		)
	})

	it('moves a row with the rows it links', async () => {
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
		expect(await linked()).toEqual([mine])
	})

	it('leaves the other many-to-many relations alone', async () => {
		const label = await Label.create({ data: {} }, M)
		await Task.update(
			{ where: { id: theirs }, data: { labels: { connect: ids(label.id) } } },
			M,
		)
		expect(
			await Label.count({ where: { tasks: { some: { id: theirs } } } }, M),
		).toBe(1)
	})
})

describe('the start', () => {
	it('needs a required one both models share, on one side', async () => {
		const Team = defineModel({
			name: 'Team',
			fields: (f) => ({
				boards: f.many(() => Board, { inverse: 'team' }),
				cards: f.many(() => Card, { inverse: 'team' }),
				others: f.many(() => Card, { inverse: 'other' }),
			}),
		})
		const Board = defineModel({
			name: 'Board',
			fields: (f) => ({
				team: f.one(() => Team, { optional: true }),
				cards: f.many(() => Card, { inverse: 'boards', within: 'team' }),
			}),
		})
		const Card = defineModel({
			name: 'Card',
			fields: (f) => ({
				team: f.one(() => Team),
				other: f.one(() => Team),
				boards: f.many(() => Board, { inverse: 'cards' }),
			}),
		})
		await expect(start([Team, Board, Card])).rejects.toThrow(
			'Board.cards: within names team, a required one relation of Board and of Card to the same model.',
		)
	})

	it("needs the other side of each model's one to the parent", async () => {
		const Org = defineModel({
			name: 'Org',
			fields: (f) => ({ tickets: f.many(() => Ticket, { inverse: 'org' }) }),
		})
		const Desk = defineModel({
			name: 'Desk',
			fields: (f) => ({
				org: f.one(() => Org),
				tickets: f.many(() => Ticket, { inverse: 'desks', within: 'org' }),
			}),
		})
		const Ticket = defineModel({
			name: 'Ticket',
			fields: (f) => ({
				org: f.one(() => Org),
				desks: f.many(() => Desk, { inverse: 'tickets' }),
			}),
		})
		await expect(start([Org, Desk, Ticket])).rejects.toThrow(
			'Desk.tickets: within names Desk.org, which needs its other side.',
		)
	})

	it('takes the string form, on one side of a many-to-many', async () => {
		const Shelf = defineModel({
			name: 'Shelf',
			fields: (f) => ({
				room: f.one(() => Room),
				books: f.many(() => Book, {
					inverse: 'shelves',
					// @ts-expect-error -- a many takes the string form only
					within: { room: 'id' },
				}),
			}),
		})
		const Book = defineModel({
			name: 'Book',
			fields: (f) => ({
				room: f.one(() => Room),
				shelves: f.many(() => Shelf, { inverse: 'books' }),
			}),
		})
		const Room = defineModel({
			name: 'Room',
			fields: (f) => ({
				shelves: f.many(() => Shelf, { inverse: 'room' }),
				books: f.many(() => Book, { inverse: 'room' }),
			}),
		})
		await expect(start([Shelf, Book, Room])).rejects.toThrow(
			"Shelf.books: within on a many names a field both models share, as within: 'room'.",
		)
		const Pin = defineModel({
			name: 'Pin',
			fields: (f) => ({
				room: f.one(() => Hall),
				charts: f.many(() => Chart, { inverse: 'pins', within: 'room' }),
			}),
		})
		const Chart = defineModel({
			name: 'Chart',
			fields: (f) => ({
				room: f.one(() => Hall),
				pins: f.many(() => Pin, { inverse: 'charts', within: 'room' }),
			}),
		})
		const Hall = defineModel({
			name: 'Hall',
			fields: (f) => ({
				pins: f.many(() => Pin, { inverse: 'room' }),
				charts: f.many(() => Chart, { inverse: 'room' }),
			}),
		})
		await expect(start([Pin, Chart, Hall])).rejects.toThrow(
			'Pin.charts and Chart.pins: within goes on one side.',
		)
		const Lane = defineModel({
			name: 'Lane',
			fields: (f) => ({
				hall: f.one(() => Gate),
				stops: f.many(() => Stop, { inverse: 'lane', within: 'hall' }),
			}),
		})
		const Stop = defineModel({
			name: 'Stop',
			fields: (f) => ({ hall: f.one(() => Gate), lane: f.one(() => Lane) }),
		})
		const Gate = defineModel({
			name: 'Gate',
			fields: (f) => ({
				lanes: f.many(() => Lane, { inverse: 'hall' }),
				stops: f.many(() => Stop, { inverse: 'hall' }),
			}),
		})
		await expect(start([Lane, Stop, Gate])).rejects.toThrow(
			'Lane.stops: within belongs on Stop.lane, which stores the key.',
		)
	})
})
