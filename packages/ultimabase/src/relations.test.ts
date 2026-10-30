// Filtered relations on `memory()` (D-151): every read of a filtered `many`
// sees only the rows its filter keeps, Master's too; writes stay physical,
// and a filtered relation takes no `set`.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from '@ultimabase/testing'
import { allow, defineApp, defineModel, master, memory } from './index.ts'
import { query } from './engine.ts'

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({
		name: f.string(),
		notes: f.many(() => Note),
		labels: f.many(() => Label),
	}),
}).with({
	access: allow.public,
	relations: {
		notes: { where: ({ where }) => where({ published: true }) },
		labels: {
			where: ({ caller, where }) =>
				caller.kind === 'master' ? true : where({ hidden: false }),
		},
	},
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		title: f.string(),
		published: f.boolean({ default: false }),
		writer: f.one(() => Writer),
	}),
}).with({ access: allow.public })

// Filters on both sides of a many-to-many type each other's fields.
const Label = defineModel({
	name: 'Label',
	fields: (f) => ({
		name: f.string({ unique: true }),
		hidden: f.boolean({ default: false }),
		writers: f.many(() => Writer),
	}),
}).with({
	access: allow.public,
	relations: {
		writers: { where: ({ where }) => where({ name: { not: 'Ghost' } }) },
	},
})

const M = { as: master }
const user = { as: asUser({ id: 'u1' }) }
let app: ReturnType<typeof defineApp>
let ada: string

beforeEach(async () => {
	app = defineApp({ database: memory(), models: [Writer, Note, Label] })
	await app.start()
	const created = await Writer.create(
		{
			data: {
				name: 'Ada',
				notes: {
					create: [
						{ title: 'Published one', published: true },
						{ title: 'Draft' },
						{ title: 'Published two', published: true },
					],
				},
				labels: {
					create: [{ name: 'open' }, { name: 'secret', hidden: true }],
				},
			},
		},
		M,
	)
	ada = created.id
	await Writer.create(
		{ data: { name: 'Bob', notes: { create: [{ title: 'Bob draft' }] } } },
		M,
	)
	const ghost = await Writer.create({ data: { name: 'Ghost' } }, M)
	await Label.update(
		{
			where: { name: 'open' },
			data: { writers: { connect: [{ id: ghost.id }] } },
		},
		M,
	)
})
afterEach(async () => app.stop())

const titles = (rows: readonly { readonly title: string }[]) =>
	rows.map((row) => row.title)

const names = async (where: object) =>
	query(
		'Writer',
		'findMany',
		{ where, orderBy: { name: 'asc' }, select: { name: true } },
		M,
	)
const named = (...list: readonly string[]) => list.map((name) => ({ name }))

describe('a filtered relation', () => {
	it('filters include and select, Master included', async () => {
		const [found] = await Writer.findMany(
			{ where: { id: ada }, include: { notes: true } },
			M,
		)
		expect(titles(found?.notes ?? [])).toStrictEqual([
			'Published one',
			'Published two',
		])
		const selected = await Writer.findUniqueOrThrow(
			{
				where: { id: ada },
				select: {
					notes: {
						where: { title: { contains: 'two' } },
						select: { title: true },
					},
				},
			},
			user,
		)
		expect(selected.notes).toStrictEqual([{ title: 'Published two' }])
	})

	it('pages through the rows it keeps', async () => {
		const found = await Writer.findUniqueOrThrow(
			{
				where: { id: ada },
				include: { notes: { orderBy: { title: 'asc' }, skip: 1, take: 1 } },
			},
			M,
		)
		expect(titles(found.notes)).toStrictEqual(['Published two'])
	})

	it('filters _count and sorts by it', async () => {
		const counted = await Writer.findMany(
			{
				select: { name: true, _count: true },
				orderBy: [{ notes: { _count: 'desc' } }, { name: 'asc' }],
			},
			M,
		)
		expect(counted).toStrictEqual([
			{ name: 'Ada', _count: { notes: 2, labels: 2 } },
			{ name: 'Bob', _count: { notes: 0, labels: 0 } },
			{ name: 'Ghost', _count: { notes: 0, labels: 1 } },
		])
		const narrowed = await Writer.findUniqueOrThrow(
			{
				where: { id: ada },
				select: {
					_count: {
						select: {
							notes: { where: { title: { startsWith: 'Published' } } },
							labels: true,
						},
					},
				},
			},
			user,
		)
		expect(narrowed._count).toStrictEqual({ notes: 2, labels: 1 })
	})

	it('filters some, every and none', async () => {
		expect(await names({ notes: { some: { title: 'Draft' } } })).toStrictEqual(
			[],
		)
		expect(
			await names({ notes: { every: { title: { startsWith: 'Published' } } } }),
		).toStrictEqual(named('Ada', 'Bob', 'Ghost'))
		expect(await names({ notes: { none: {} } })).toStrictEqual(
			named('Bob', 'Ghost'),
		)
	})

	it('depends on the caller', async () => {
		const labels = async (as: typeof M | typeof user) =>
			(
				await Writer.findUniqueOrThrow(
					{
						where: { id: ada },
						include: { labels: { orderBy: { name: 'asc' } } },
					},
					as,
				)
			).labels.map((label) => label.name)
		expect(await labels(M)).toStrictEqual(['open', 'secret'])
		expect(await labels(user)).toStrictEqual(['open'])
	})

	it('filters the other side of a many-to-many', async () => {
		const open = await Label.findUniqueOrThrow(
			{ where: { name: 'open' }, include: { writers: true } },
			M,
		)
		expect(open.writers.map((writer) => writer.name)).toStrictEqual(['Ada'])
	})

	it('writes the rows the database holds, hidden ones included', async () => {
		const draft = await Note.findFirstOrThrow({ where: { title: 'Draft' } }, M)
		const bob = await Writer.findFirstOrThrow({ where: { name: 'Bob' } }, M)
		await Writer.update(
			{
				where: { id: bob.id },
				data: { notes: { connect: [{ id: draft.id }] } },
			},
			M,
		)
		const moved = await Note.findUniqueOrThrow(
			{ where: { id: draft.id }, include: { writer: true } },
			M,
		)
		expect(moved.writer?.name).toBe('Bob')
		await Writer.update(
			{
				where: { id: ada },
				data: { notes: { create: [{ title: 'Hidden draft' }] } },
			},
			M,
		)
		const hidden = await Note.findFirstOrThrow(
			{ where: { title: 'Hidden draft' }, include: { writer: true } },
			M,
		)
		// A filter fills in no value on create.
		expect(hidden).toMatchObject({ published: false, writer: { name: 'Ada' } })
	})

	it('takes no set', async () => {
		await expect(
			query(
				'Writer',
				'update',
				{ where: { id: ada }, data: { notes: { set: [] } } },
				M,
			),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			path: 'data.notes.set',
			message: 'Writer.notes is filtered; use connect and disconnect, not set.',
		})
	})

	it("filters the relations of a read rule's own filter", async () => {
		const Club = defineModel({
			name: 'Club',
			fields: (f) => ({
				name: f.string(),
				members: f.many(() => Member),
			}),
		}).with({
			// A club is readable when one of its active members is.
			access: {
				read: ({ where }) => where({ members: { some: { name: 'Ada' } } }),
			},
			relations: {
				members: { where: ({ where }) => where({ active: true }) },
			},
		})
		const Member = defineModel({
			name: 'Member',
			fields: (f) => ({
				name: f.string(),
				active: f.boolean(),
				club: f.one(() => Club),
			}),
		}).with({ access: allow.public })
		await app.stop()
		app = defineApp({ database: memory(), models: [Club, Member] })
		await app.start()
		await Club.create(
			{
				data: {
					name: 'Chess',
					members: { create: [{ name: 'Ada', active: true }] },
				},
			},
			M,
		)
		await Club.create(
			{
				data: {
					name: 'Go',
					members: { create: [{ name: 'Ada', active: false }] },
				},
			},
			M,
		)
		const clubs = await Club.findMany({ select: { name: true } }, user)
		expect(clubs).toStrictEqual([{ name: 'Chess' }])
	})
})

/** An application of one self-related model, `Person`, with `relations`. */
const people = (relations: object) => {
	const Person = defineModel({
		name: 'Person',
		fields: (f) => ({
			name: f.string(),
			best: f.one(() => Person, { optional: true, inverse: 'fans' }),
			fans: f.many(() => Person, { inverse: 'best' }),
		}),
	})
	Reflect.apply(Reflect.get(Person, 'with'), Person, [
		{ access: allow.public, relations },
	])
	return { Person, app: defineApp({ database: memory(), models: [Person] }) }
}

/** Bob's fans of Ada, read through a filter on `fans`. */
const fansOf = async (where: () => unknown) => {
	const { Person, app: started } = people({ fans: { where } })
	await app.stop()
	app = started
	await app.start()
	const star = await Person.create({ data: { name: 'Ada' } }, M)
	await Person.create(
		{ data: { name: 'Bob', best: { connect: { id: star.id } } } },
		M,
	)
	return query(
		'Person',
		'findMany',
		{ where: { id: star.id }, select: { fans: { select: { name: true } } } },
		M,
	)
}

const shelf = () =>
	defineModel({
		name: 'Shelf',
		fields: (f) => ({
			notes: f.many(() => Note),
			first: f.one(() => Note),
		}),
	}).with({
		relations: {
			// @ts-expect-error -- the target has no `ghost` field
			notes: { where: ({ where }) => where({ ghost: true }) },
			// @ts-expect-error -- a one relation takes no filter (D-151)
			first: { where: () => true },
		},
	})

describe('a relation filter', () => {
	it('stops startup unless it names a many relation with a where', async () => {
		await expect(
			people({ best: { where: () => true } }).app.start(),
		).rejects.toThrow(
			'Person.with.relations.best: best is not a many relation.',
		)
		await expect(
			people({ ghost: { where: () => true } }).app.start(),
		).rejects.toThrow(
			'Person.with.relations.ghost: ghost is not a many relation.',
		)
		await expect(people({ fans: { where: true } }).app.start()).rejects.toThrow(
			'Person.with.relations.fans takes a where function.',
		)
	})

	it('keeps nothing when it returns false, and fails on another value', async () => {
		expect(await fansOf(() => false)).toStrictEqual([{ fans: [] }])
		await expect(fansOf(() => ({ name: 'Bob' }))).rejects.toThrow(
			'Person.with.relations.fans.where returns where({ ... }) or a boolean.',
		)
		await expect(
			fansOf(() => {
				throw new Error('boom')
			}),
		).rejects.toThrow('boom')
	})

	it('fails when it reads the relation itself', async () => {
		const { app: started } = people({
			fans: {
				where: ({ where }: { readonly where: (filter: object) => unknown }) =>
					where({ fans: { some: {} } }),
			},
		})
		await app.stop()
		app = started
		await app.start()
		await expect(
			query('Person', 'findMany', { include: { fans: true } }, M),
		).rejects.toThrow('Person.fans: its filter reads the relation itself.')
	})

	it('is typed from the target, on many relations only', () => {
		expect(shelf).toBeTypeOf('function')
	})
})
