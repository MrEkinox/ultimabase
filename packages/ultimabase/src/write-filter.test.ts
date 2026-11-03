// A write rule may return `where()`: each row the write changes matches it,
// before an update or a delete and after a create or an update (D-214).
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	allOf,
	allow,
	anyOf,
	defineApp,
	defineModel,
	master,
	memory,
	PublicError,
} from './index.ts'

const M = { as: master }
const ada = { as: asUser({ id: 'ada' }) }

const notOwner = new PublicError(
	'NOT_PROJECT_OWNER',
	'Only the project owner edits its tasks.',
)

const Project = defineModel({
	name: 'Project',
	fields: (f) => ({
		name: f.string(),
		owner: f.string(),
		tasks: f.many(() => Task),
	}),
}).with({
	access: {
		read: allow.public,
		create: () => true,
		update: ({ caller, where }) =>
			caller.kind === 'user' && where({ owner: { equals: caller.user.id } }),
	},
})

// Ada writes the tasks of her projects; a locked task is never written.
const Task = defineModel({
	name: 'Task',
	fields: (f) => ({
		title: f.string(),
		locked: f.boolean({ default: false }),
		project: f.one(() => Project, { optional: true }),
	}),
}).with({
	access: {
		read: allow.public,
		write: allOf(
			({ caller, where }) =>
				caller.kind === 'user' &&
				where(
					{ project: { is: { owner: { equals: caller.user.id } } } },
					notOwner,
				),
			({ where }) => where({ locked: { equals: false } }),
		),
	},
})

async function refusal(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run()
	} catch (error) {
		if (error instanceof PublicError) {
			return { code: error.code, details: error.details }
		}
		throw error
	}
	return undefined
}

let app: ReturnType<typeof defineApp>
let ids: { mine: string; theirs: string; task: string; other: string }
beforeEach(async () => {
	app = defineApp({ database: memory(), models: [Project, Task] })
	await app.start()
	const project = async (owner: string) =>
		(await Project.create({ data: { name: owner, owner } }, M)).id
	const mine = await project('ada')
	const theirs = await project('bob')
	const task = async (id: string) =>
		(
			await Task.create(
				{ data: { title: 't', project: { connect: { id } } } },
				M,
			)
		).id
	ids = { mine, theirs, task: await task(mine), other: await task(theirs) }
})
afterEach(async () => app.stop())

const titles = async (): Promise<string[]> =>
	(await Task.findMany({ orderBy: { title: 'asc' } }, M)).map((t) => t.title)

const ownerOf = async (id: string): Promise<string | undefined> => {
	const task = await Task.findUnique(
		{ where: { id }, include: { project: true } },
		M,
	)
	return task?.project?.owner
}

const into = (id: string) => ({ project: { connect: { id } } })

/** A task created with a new project of `owner`'s. */
const made = (owner: string) => ({
	title: owner,
	project: { create: { name: owner, owner } },
})

/** An upsert of the task `id`, or a create in `project`; its refusal. */
const upsert = (id: string, project: string) =>
	refusal(async () =>
		Task.upsert(
			{
				where: { id },
				create: { title: 'c', ...into(project) },
				update: { title: 'u' },
			},
			ada,
		),
	)

/** A write of Ada's project's tasks, from the project. */
const throughMine = (tasks: object) => async () =>
	Project.update({ where: { id: ids.mine }, data: { tasks } }, ada)

/** The refusal of a create under these rules, in an application of its own. */
const failing = async (access: object, field?: object) => {
	await app.stop()
	const Note = defineModel({
		name: 'Note',
		fields: (f) => ({
			text: f.string().with({ access: field ?? {} }),
		}),
	}).with({ access: { create: () => true, ...access } })
	app = defineApp({ database: memory(), models: [Note] })
	await app.start()
	return refusal(async () => Note.create({ data: { text: 'a' } }, ada))
}

describe('an update', () => {
	it('writes a row inside the filter', async () => {
		await Task.update({ where: { id: ids.task }, data: { title: 'u' } }, ada)
		expect(await titles()).toEqual(['t', 'u'])
	})

	it("is refused with the filter's error on a row outside it", async () => {
		const error = await refusal(async () =>
			Task.update({ where: { id: ids.other }, data: { title: 'u' } }, ada),
		)
		expect(error).toMatchObject({ code: 'NOT_PROJECT_OWNER' })
		expect(await titles()).toEqual(['t', 't'])
	})

	it('is refused, and rolled back, when the row leaves the filter', async () => {
		const error = await refusal(async () =>
			Task.update(
				{ where: { id: ids.task }, data: { title: 'u', ...into(ids.theirs) } },
				ada,
			),
		)
		expect(error).toMatchObject({ code: 'NOT_PROJECT_OWNER' })
		expect(await ownerOf(ids.task)).toBe('ada')
		expect(await titles()).toEqual(['t', 't'])
	})

	it('checks each filter of allOf alone, each with its own error', async () => {
		const error = await refusal(async () =>
			Task.update({ where: { id: ids.task }, data: { locked: true } }, ada),
		)
		expect(error).toMatchObject({
			code: 'ACCESS_DENIED',
			details: { model: 'Task', operation: 'update' },
		})
	})

	it('runs no rule for Master', async () => {
		await Task.update(
			{ where: { id: ids.other }, data: { title: 'u', locked: true } },
			M,
		)
		expect(await titles()).toEqual(['t', 'u'])
	})
})

describe('a create', () => {
	it('checks the row with its connected relations', async () => {
		await Task.create({ data: { title: 'n', ...into(ids.mine) } }, ada)
		const error = await refusal(async () =>
			Task.create({ data: { title: 'x', ...into(ids.theirs) } }, ada),
		)
		expect(error).toMatchObject({ code: 'NOT_PROJECT_OWNER' })
		expect(await titles()).toEqual(['n', 't', 't'])
	})

	it('checks the row with its created relations', async () => {
		await Task.create({ data: made('ada') }, ada)
		const error = await refusal(async () =>
			Task.create({ data: made('bob') }, ada),
		)
		expect(error).toMatchObject({ code: 'NOT_PROJECT_OWNER' })
		expect(await titles()).toEqual(['ada', 't', 't'])
		expect(await Project.count({}, M)).toBe(3)
	})

	it('writes no row of a createMany when one is outside', async () => {
		const error = await refusal(async () =>
			Task.createMany(
				{
					data: [
						{ title: 'a', ...into(ids.mine) },
						{ title: 'b', ...into(ids.theirs) },
					],
				},
				ada,
			),
		)
		expect(error).toMatchObject({ code: 'NOT_PROJECT_OWNER' })
		await Task.createMany(
			{
				data: [
					{ title: 'a', ...into(ids.mine) },
					{ title: 'b', ...into(ids.mine) },
				],
			},
			ada,
		)
		expect(await titles()).toEqual(['a', 'b', 't', 't'])
	})
})

describe('a delete', () => {
	it('checks the row before it goes', async () => {
		const error = await refusal(async () =>
			Task.delete({ where: { id: ids.other } }, ada),
		)
		expect(error).toMatchObject({ code: 'NOT_PROJECT_OWNER' })
		await Task.delete({ where: { id: ids.task } }, ada)
		expect(await titles()).toEqual(['t'])
		expect(await ownerOf(ids.other)).toBe('bob')
	})
})

describe('a write of many rows', () => {
	it('refuses an updateMany whole', async () => {
		const error = await refusal(async () =>
			Task.updateMany({ where: {}, data: { title: 'u' } }, ada),
		)
		expect(error).toMatchObject({ code: 'NOT_PROJECT_OWNER' })
		expect(await titles()).toEqual(['t', 't'])
		const mine = { project: { is: { owner: { equals: 'ada' } } } }
		await Task.updateMany({ where: mine, data: { title: 'u' } }, ada)
		expect(await titles()).toEqual(['t', 'u'])
	})

	it('rolls an updateMany back when a row leaves the filter', async () => {
		const mine = { project: { is: { owner: { equals: 'ada' } } } }
		const error = await refusal(async () =>
			Task.updateMany({ where: mine, data: { title: 'u', locked: true } }, ada),
		)
		expect(error).toMatchObject({ code: 'ACCESS_DENIED' })
		expect(await titles()).toEqual(['t', 't'])
	})

	it('refuses a deleteMany whole', async () => {
		const error = await refusal(async () => Task.deleteMany({ where: {} }, ada))
		expect(error).toMatchObject({ code: 'NOT_PROJECT_OWNER' })
		expect(await titles()).toEqual(['t', 't'])
	})

	it('checks both sides of an upsert', async () => {
		expect(await upsert(ids.other, ids.mine)).toMatchObject({
			code: 'NOT_PROJECT_OWNER',
		})
		const missing = '01900000-0000-7000-8000-000000000000'
		expect(await upsert(missing, ids.theirs)).toMatchObject({
			code: 'NOT_PROJECT_OWNER',
		})
		expect(await upsert(ids.task, ids.mine)).toBeUndefined()
		expect(await titles()).toEqual(['t', 'u'])
	})
})

describe('a write through a relation', () => {
	it('checks a row moved from the other side, before the move', async () => {
		const error = await refusal(throughMine({ connect: [{ id: ids.other }] }))
		expect(error).toMatchObject({ code: 'NOT_PROJECT_OWNER' })
		expect(await ownerOf(ids.other)).toBe('bob')
	})

	it('checks a nested create and a nested update', async () => {
		await refusal(throughMine({ create: [{ title: 'n' }] }))
		expect(await titles()).toEqual(['n', 't', 't'])
		const locked = await refusal(
			throughMine({
				update: [{ where: { id: ids.task }, data: { locked: true } }],
			}),
		)
		expect(locked).toMatchObject({ code: 'ACCESS_DENIED' })
		expect(await Task.count({ where: { locked: { equals: true } } }, M)).toBe(0)
	})
})

describe('a rule outside the filters', () => {
	it('joins the filters of anyOf, failing with ACCESS_DENIED', async () => {
		await app.stop()
		const Note = defineModel({
			name: 'Note',
			fields: (f) => ({ text: f.string() }),
		}).with({
			access: {
				read: allow.public,
				create: () => true,
				update: anyOf(
					({ where }) => where({ text: { equals: 'a' } }, notOwner),
					({ where }) => where({ text: { equals: 'b' } }, notOwner),
				),
			},
		})
		app = defineApp({ database: memory(), models: [Note] })
		await app.start()
		const a = await Note.create({ data: { text: 'a' } }, ada)
		await Note.update({ where: { id: a.id }, data: { text: 'b' } }, ada)
		const error = await refusal(async () =>
			Note.update({ where: { id: a.id }, data: { text: 'c' } }, ada),
		)
		expect(error).toMatchObject({ code: 'ACCESS_DENIED' })
	})

	it("propagates a boolean rule's PublicError", async () => {
		await app.stop()
		const Note = defineModel({
			name: 'Note',
			fields: (f) => ({ text: f.string() }),
		}).with({
			access: {
				create: () => {
					throw new PublicError('QUOTA', 'No more notes.')
				},
			},
		})
		app = defineApp({ database: memory(), models: [Note] })
		await app.start()
		const error = await refusal(async () =>
			Note.create({ data: { text: 'a' } }, ada),
		)
		expect(error).toMatchObject({ code: 'QUOTA' })
	})

	it('refuses an error that is not a PublicError', async () => {
		await app.stop()
		const Note = defineModel({
			name: 'Note',
			fields: (f) => ({ text: f.string() }),
		}).with({
			access: {
				// @ts-expect-error: the error is a PublicError.
				create: ({ where }) => where({}, new Error('no')),
			},
		})
		app = defineApp({ database: memory(), models: [Note] })
		await app.start()
		await expect(Note.create({ data: { text: 'a' } }, ada)).rejects.toThrow(
			"A write rule's where takes a PublicError.",
		)
	})

	it('types a read rule and a field rule without an error', () => {
		const Typed = defineModel({
			name: 'Typed',
			fields: (f) => ({
				text: f.string().with({
					// @ts-expect-error: a field rule receives no `where`.
					access: { update: ({ where }) => where !== undefined },
				}),
			}),
		}).with({
			access: {
				// @ts-expect-error: a read rule's where takes no error.
				read: ({ where }) => where({}, notOwner),
			},
		})
		expect(Typed.name).toBe('Typed')
	})
})

describe('a model with delete hooks', () => {
	it('checks the rows of a deleteMany before its hooks run', async () => {
		await app.stop()
		const ran: string[] = []
		const Note = defineModel({
			name: 'Note',
			fields: (f) => ({ text: f.string() }),
		}).with({
			access: {
				read: allow.public,
				delete: ({ where }) => where({ text: { equals: 'a' } }, notOwner),
			},
			hooks: {
				beforeDelete: ({ record }) => {
					ran.push(record.text)
				},
			},
		})
		app = defineApp({ database: memory(), models: [Note] })
		await app.start()
		await Note.createMany({ data: [{ text: 'a' }, { text: 'b' }] }, M)
		const error = await refusal(async () => Note.deleteMany({ where: {} }, ada))
		expect(error).toMatchObject({ code: 'NOT_PROJECT_OWNER' })
		expect(ran).toEqual([])
		await Note.deleteMany({ where: { text: { equals: 'a' } } }, ada)
		expect(ran).toEqual(['a'])
		expect(await Note.count({}, M)).toBe(1)
	})
})

describe('a rule that breaks the contract', () => {
	it('fails with a TypeError', async () => {
		const field = { create: () => 'yes' }
		await expect(failing({}, field)).rejects.toThrow(
			'A field rule returns a boolean.',
		)
		const combined = { create: allOf(() => 3) }
		await expect(failing(combined)).rejects.toThrow(
			'A rule returns a boolean or a filter.',
		)
	})
})
