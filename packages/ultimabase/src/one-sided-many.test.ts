// A many-to-many declared on one side on `memory()` (D-248): its side reads
// and writes as any many-to-many, its target gets no field, and the start
// checks the hidden side's name.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExposedModel, PluginTypes } from './index.ts'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import { schemaOf } from './lifecycle.ts'
import { oneSidedOf } from './one-sided.ts'

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

interface Reader extends PluginTypes {
	readonly name: 'reader'
}
const seen: { models: readonly ExposedModel[] } = { models: [] }
const reader = definePlugin<Reader>({
	name: 'reader',
	manifest: {
		name: 'test-reader',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	start: ({ models }) => {
		seen.models = models
	},
})

const M = { as: master }
const models = [Project, Membership, Task, Person]

let app: ReturnType<typeof defineApp>
let project: string
let ann: string
let bob: string
let task: string

/** A start of `list`, for `toThrow`. */
const started =
	(...list: readonly object[]) =>
	() =>
		schemaOf({ database: memory(), models: list })

const ids = (...each: string[]) => each.map((id) => ({ id }))
const assigned = async () =>
	(
		await Task.findUnique(
			{
				where: { id: task },
				select: { assignees: { select: { name: true } } },
			},
			M,
		)
	)?.assignees.map(({ name }) => name)

beforeEach(async () => {
	app = defineApp({ database: memory(), models, plugins: [reader.plugin()] })
	await app.start()
	project = (await Project.create({ data: { name: 'P' } }, M)).id
	const member = (name: string) =>
		Membership.create(
			{ data: { name, project: { connect: { id: project } } } },
			M,
		)
	ann = (await member('Ann')).id
	bob = (await member('Bob')).id
	task = (
		await Task.create(
			{ data: { name: 'T', project: { connect: { id: project } } } },
			M,
		)
	).id
})

afterEach(async () => app.stop())

describe('a many declared on one side', () => {
	it('links and unlinks as a many-to-many', async () => {
		await Task.update(
			{ where: { id: task }, data: { assignees: { connect: ids(ann, bob) } } },
			M,
		)
		expect(await assigned()).toStrictEqual(['Ann', 'Bob'])
		await Task.update(
			{ where: { id: task }, data: { assignees: { disconnect: ids(ann) } } },
			M,
		)
		expect(await assigned()).toStrictEqual(['Bob'])
		await Task.update(
			{ where: { id: task }, data: { assignees: { set: ids(ann) } } },
			M,
		)
		expect(await assigned()).toStrictEqual(['Ann'])
		await Task.update(
			{
				where: { id: task },
				data: {
					assignees: {
						create: [{ name: 'Cid', project: { connect: { id: project } } }],
					},
				},
			},
			M,
		)
		expect(await assigned()).toStrictEqual(['Ann', 'Cid'])
	})

	it('filters, counts and sorts by its rows', async () => {
		const other = (
			await Task.create(
				{
					data: {
						name: 'U',
						project: { connect: { id: project } },
						assignees: { connect: ids(ann, bob) },
					},
				},
				M,
			)
		).id
		await Task.update(
			{ where: { id: task }, data: { assignees: { connect: ids(bob) } } },
			M,
		)
		const found = await Task.findMany(
			{
				where: { assignees: { some: { name: 'Ann' } } },
				select: { id: true, _count: { select: { assignees: true } } },
			},
			M,
		)
		expect(found).toStrictEqual([{ id: other, _count: { assignees: 2 } }])
		const sorted = await Task.findMany(
			{ orderBy: { assignees: { _count: 'desc' } }, select: { name: true } },
			M,
		)
		expect(sorted).toStrictEqual([{ name: 'U' }, { name: 'T' }])
		await expect(
			Task.count({ where: { assignees: { none: {} } } }, M),
		).resolves.toBe(0)
	})

	it('keeps its rows within their parent', async () => {
		const elsewhere = (await Project.create({ data: { name: 'Q' } }, M)).id
		const stranger = (
			await Membership.create(
				{ data: { name: 'Dan', project: { connect: { id: elsewhere } } } },
				M,
			)
		).id
		await expect(
			Task.update(
				{
					where: { id: task },
					data: { assignees: { connect: ids(stranger) } },
				},
				M,
			),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	})

	it("drops a row's links when either side is deleted", async () => {
		await Task.update(
			{ where: { id: task }, data: { assignees: { connect: ids(ann, bob) } } },
			M,
		)
		await Membership.delete({ where: { id: ann } }, M)
		expect(await assigned()).toStrictEqual(['Bob'])
		await Task.delete({ where: { id: task } }, M)
		await expect(Membership.count({}, M)).resolves.toBe(1)
	})

	it('relates a model to itself', async () => {
		const a = (await Person.create({ data: { name: 'A' } }, M)).id
		const b = (await Person.create({ data: { name: 'B' } }, M)).id
		await Person.update(
			{ where: { id: a }, data: { follows: { connect: ids(b) } } },
			M,
		)
		const read = await Person.findMany(
			{ select: { name: true, follows: { select: { name: true } } } },
			M,
		)
		expect(read).toStrictEqual([
			{ name: 'A', follows: [{ name: 'B' }] },
			{ name: 'B', follows: [] },
		])
	})
})

describe("a one-sided many's target", () => {
	it('gets a hidden side that the adapter reads', () => {
		const membership = schemaOf({ database: memory(), models }).models.find(
			({ name }) => name === 'Membership',
		)
		expect(
			membership?.fields.find(({ name }) => name === 'taskAssignees'),
		).toStrictEqual({
			kind: 'many',
			name: 'taskAssignees',
			target: 'Task',
			inverse: 'assignees',
			join: true,
			hidden: true,
		})
	})

	it("points its hidden side at the declaring model's definition", () => {
		const declared = {
			kind: 'many' as const,
			target: () => Membership,
			options: { inverse: false },
		}
		const { hidden } = oneSidedOf(
			[
				{
					model: 'Task',
					name: 'assignees',
					field: declared,
					target: 'Membership',
				},
			],
			() => false,
			(model) => (model === 'Task' ? Task : undefined),
		)
		expect(hidden.map(({ field }) => field.target())).toStrictEqual([Task])
	})

	it('shows no field to plugins', () => {
		const membership = seen.models.find(
			({ schema }) => schema.name === 'Membership',
		)
		expect(membership?.schema.fields.map(({ name }) => name)).toStrictEqual([
			'name',
			'project',
		])
	})

	it('lets no caller name its hidden side', async () => {
		const unknown = { code: 'INVALID_QUERY' }
		const raw = Reflect.get(Membership, 'findMany')
		const find = (args: object): Promise<unknown> => {
			const found: unknown = Reflect.apply(raw, Membership, [args, M])
			return Promise.resolve(found)
		}
		await expect(
			find({ where: { taskAssignees: { some: {} } } }),
		).rejects.toMatchObject(unknown)
		await expect(
			find({ select: { taskAssignees: true } }),
		).rejects.toMatchObject(unknown)
		await expect(
			find({ orderBy: { taskAssignees: { _count: 'asc' } } }),
		).rejects.toMatchObject(unknown)
		await expect(
			find({ select: { _count: { select: { taskAssignees: true } } } }),
		).rejects.toMatchObject(unknown)
		await expect(
			find({ where: { id: ann }, select: { _count: true } }),
		).resolves.toStrictEqual([{}])
		const update = Reflect.get(Membership, 'update')
		await expect(
			Reflect.apply(update, Membership, [
				{
					where: { id: ann },
					data: { taskAssignees: { connect: ids(task) } },
				},
				M,
			]),
		).rejects.toMatchObject(unknown)
	})
})

describe('the start', () => {
	it('stops on a field the hidden side would be', () => {
		const Taken = defineModel({
			name: 'Membership',
			fields: (f) => ({ taskAssignees: f.string() }),
		})
		const Owner = defineModel({
			name: 'Task',
			fields: (f) => ({ assignees: f.many(() => Taken, { inverse: false }) }),
		})
		expect(started(Taken, Owner)).toThrow(
			'Task.assignees: Membership has a field taskAssignees, the name its hidden side takes.',
		)
	})

	it('names the form a many without inverse may take', () => {
		const Target = defineModel({ name: 'Target', fields: () => ({}) })
		const Owner = defineModel({
			name: 'Owner',
			fields: (f) => ({
				// @ts-expect-error -- a many names its other side.
				targets: f.many(() => Target, {}),
			}),
		})
		expect(started(Target, Owner)).toThrow(
			'Owner.targets: a many names its other side with inverse, or takes inverse: false for a many-to-many with no other side.',
		)
	})

	it('refuses a size, as on any many-to-many', () => {
		const Target = defineModel({ name: 'Target', fields: () => ({}) })
		const Owner = defineModel({
			name: 'Owner',
			fields: (f) => ({
				targets: f.many(() => Target, { inverse: false, size: { max: 2 } }),
			}),
		})
		expect(started(Target, Owner)).toThrow('Owner.targets')
	})
})
