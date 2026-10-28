// Relation views on `memory()` (D-151): a read-only `many` on the link of
// another `many` of the model, its rows those its filter keeps.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { allow, defineApp, defineModel, master, memory } from './index.ts'
import { query } from './engine.ts'

const Author = defineModel({
	name: 'Author',
	fields: (f) => ({
		name: f.string(),
		posts: f.many(() => Post),
		published: f.many(() => Post, { from: 'posts' }),
		tags: f.many(() => Tag),
		featured: f.many(() => Tag, { from: 'tags' }),
	}),
}).with({
	access: allow.public,
	relations: {
		published: { where: ({ where }) => where({ published: true }) },
		featured: { where: ({ where }) => where({ featured: true }) },
	},
})

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		published: f.boolean({ default: false }),
		author: f.one(() => Author),
	}),
}).with({ access: allow.public })

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		name: f.string({ unique: true }),
		featured: f.boolean({ default: false }),
		authors: f.many(() => Author),
	}),
}).with({ access: allow.public })

const M = { as: master }
let app: ReturnType<typeof defineApp>
let ada: string

beforeEach(async () => {
	app = defineApp({ database: memory(), models: [Author, Post, Tag] })
	await app.start()
	const created = await Author.create(
		{
			data: {
				name: 'Ada',
				posts: {
					create: [
						{ title: 'Out', published: true },
						{ title: 'Draft' },
						{ title: 'Also out', published: true },
					],
				},
				tags: {
					create: [{ name: 'math', featured: true }, { name: 'misc' }],
				},
			},
		},
		M,
	)
	ada = created.id
	await Author.create(
		{ data: { name: 'Bob', posts: { create: [{ title: 'Bob draft' }] } } },
		M,
	)
})
afterEach(async () => app.stop())

const names = async (where: object) =>
	query(
		'Author',
		'findMany',
		{ where, orderBy: { name: 'asc' }, select: { name: true } },
		M,
	)
const named = (...list: readonly string[]) => list.map((name) => ({ name }))

const typed = () => [
	Author.create(
		// @ts-expect-error -- a view is read-only (D-151)
		{ data: { name: 'Eve', published: { connect: [] } } },
		M,
	),
	Author.update(
		// @ts-expect-error -- a view is read-only (D-151)
		{ where: { id: ada }, data: { featured: { connect: [] } } },
		M,
	),
]

describe('a view', () => {
	it('reads the rows of its relation that its filter keeps', async () => {
		const found = await Author.findUniqueOrThrow(
			{
				where: { id: ada },
				select: {
					posts: { select: { title: true }, orderBy: { title: 'asc' } },
					published: { select: { title: true }, orderBy: { title: 'asc' } },
					featured: { select: { name: true } },
					_count: true,
				},
			},
			M,
		)
		expect(found).toStrictEqual({
			posts: [{ title: 'Also out' }, { title: 'Draft' }, { title: 'Out' }],
			published: [{ title: 'Also out' }, { title: 'Out' }],
			featured: [{ name: 'math' }],
			_count: { posts: 3, published: 2, tags: 2, featured: 1 },
		})
	})

	it('filters and sorts by its rows', async () => {
		expect(await names({ published: { some: {} } })).toStrictEqual(named('Ada'))
		expect(await names({ published: { none: {} } })).toStrictEqual(named('Bob'))
		expect(
			await names({ featured: { every: { name: 'math' } } }),
		).toStrictEqual(named('Ada', 'Bob'))
		const sorted = await Author.findMany(
			{
				select: { name: true },
				orderBy: [{ published: { _count: 'desc' } }, { name: 'asc' }],
			},
			M,
		)
		expect(sorted).toStrictEqual([{ name: 'Ada' }, { name: 'Bob' }])
	})

	it('follows the writes of its relation', async () => {
		const misc = await Tag.findUniqueOrThrow({ where: { name: 'misc' } }, M)
		await Tag.update({ where: { id: misc.id }, data: { featured: true } }, M)
		await Tag.delete({ where: { name: 'math' } }, M)
		const found = await Author.findUniqueOrThrow(
			{ where: { id: ada }, include: { featured: true } },
			M,
		)
		expect(found.featured.map((tag) => tag.name)).toStrictEqual(['misc'])
		const cy = await Author.create(
			{ data: { name: 'Cy', tags: { connect: [{ id: misc.id }] } } },
			M,
		)
		await Author.delete({ where: { id: cy.id } }, M)
		const left = await Tag.findUniqueOrThrow(
			{ where: { id: misc.id }, include: { authors: true } },
			M,
		)
		expect(left.authors.map((author) => author.name)).toStrictEqual(['Ada'])
	})

	it('is not written', async () => {
		await expect(
			query(
				'Author',
				'update',
				{ where: { id: ada }, data: { published: { connect: [] } } },
				M,
			),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			path: 'data.published',
		})
		await expect(
			query(
				'Author',
				'create',
				{ data: { name: 'Eve', featured: { create: [] } } },
				M,
			),
		).rejects.toMatchObject({ code: 'INVALID_QUERY', path: 'data.featured' })
	})

	it('is absent from the types of data', () => {
		expect(typed).toBeTypeOf('function')
	})

	it('reads a self relation', async () => {
		const Person = defineModel({
			name: 'Person',
			fields: (f) => ({
				name: f.string(),
				best: f.one(() => Person, { optional: true, inverse: 'fans' }),
				fans: f.many(() => Person, { inverse: 'best' }),
				young: f.many(() => Person, { from: 'fans' }),
			}),
		}).with({
			access: allow.public,
			relations: {
				young: { where: ({ where }) => where({ name: { startsWith: 'Y' } }) },
			},
		})
		await app.stop()
		app = defineApp({ database: memory(), models: [Person] })
		await app.start()
		const star = await Person.create({ data: { name: 'Ada' } }, M)
		for (const name of ['Yan', 'Bob']) {
			await Person.create(
				{ data: { name, best: { connect: { id: star.id } } } },
				M,
			)
		}
		const found = await Person.findUniqueOrThrow(
			{ where: { id: star.id }, include: { young: true } },
			M,
		)
		expect(found.young.map((fan) => fan.name)).toStrictEqual(['Yan'])
	})
})

/**
 * Starts an application whose `Shelf.view` takes `options`, to `Note` or to
 * `Shelf`; `Shelf.other` is a valid view of `notes`.
 */
const start = (
	target: 'Note' | 'Shelf',
	options: { readonly from: string },
	relations: object = {
		other: { where: () => true },
		view: { where: () => true },
	},
) => {
	const Shelf = defineModel({
		name: 'Shelf',
		fields: (f) => ({
			label: f.string(),
			notes: f.many(() => Note),
			first: f.one(() => Note, { optional: true, inverse: 'opened' }),
			other: f.many(() => Note, { from: 'notes' }),
			view:
				target === 'Note'
					? f.many(() => Note, options)
					: f.many(() => Shelf, options),
		}),
	})
	Reflect.apply(Reflect.get(Shelf, 'with'), Shelf, [{ relations }])
	const Note = defineModel({
		name: 'Note',
		fields: (f) => ({
			shelf: f.one(() => Shelf),
			opened: f.many(() => Shelf, { inverse: 'first' }),
		}),
	})
	return defineApp({ database: memory(), models: [Shelf, Note] }).start()
}

describe('a view', () => {
	it('stops startup unless it reads a many relation to its target', async () => {
		for (const from of ['ghost', 'label', 'first']) {
			await expect(start('Note', { from })).rejects.toThrow(
				`Shelf.view: from '${from}' is not a many relation.`,
			)
		}
		await expect(start('Note', { from: 'other' })).rejects.toThrow(
			"Shelf.view: from 'other' is a view; name its relation.",
		)
		await expect(start('Shelf', { from: 'notes' })).rejects.toThrow(
			"Shelf.view: from 'notes' relates to Note, not Shelf.",
		)
	})

	it('stops startup without a filter', async () => {
		await expect(
			start('Note', { from: 'notes' }, { other: { where: () => true } }),
		).rejects.toThrow(
			'Shelf.view is a view; filter it in .with({ relations }).',
		)
	})

	it('takes no inverse', async () => {
		await expect(
			start('Note', {
				from: 'notes',
				// @ts-expect-error -- a view has no inverse (D-151)
				inverse: 'shelf',
			}),
		).rejects.toThrow('Shelf.view is a view and takes no inverse.')
	})
})
