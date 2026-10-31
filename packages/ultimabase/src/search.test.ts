// Full-text search (D-148): `_search` keeps the rows whose searched fields
// match a text, `_relevance` sorts them by how well.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { allow, defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string({ search: true }),
		body: f.string({ search: true, optional: true }),
		rank: f.number(),
		author: f.one(() => Author, { optional: true }),
	}),
})

const Author = defineModel({
	name: 'Author',
	fields: (f) => ({ name: f.string(), posts: f.many(() => Post) }),
})

const titles = (rows: readonly { readonly title: string }[]): string[] =>
	rows.map((row) => row.title)

describe('full-text search', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		app = defineApp({ database: memory(), models: [Post, Author] })
		await app.start()
		const { id } = await Author.create({ data: { name: 'Ada' } }, M)
		await Post.createMany(
			{
				data: [
					{ title: 'Red apples', body: 'apple pie and apple jam', rank: 1 },
					{ title: 'Green pears', body: 'no apple here', rank: 2 },
					{ title: 'Blue sky', rank: 3, author: { connect: { id } } },
					{
						title: 'Apple trees',
						body: 'orchards',
						rank: 4,
						author: { connect: { id } },
					},
				],
			},
			M,
		)
	})
	afterEach(async () => app.stop())

	it('keeps the rows whose searched fields match, in every read and write', async () => {
		const apple = { _search: 'apple' }
		const found = await Post.findMany(
			{ where: apple, orderBy: { rank: 'asc' } },
			M,
		)
		expect(titles(found)).toStrictEqual([
			'Red apples',
			'Green pears',
			'Apple trees',
		])
		expect(
			titles(await Post.findMany({ where: { _search: 'apple -pears' } }, M)),
		).toStrictEqual(['Red apples', 'Apple trees'])
		expect(
			titles(await Post.findMany({ where: { _search: '"blue sky"' } }, M)),
		).toStrictEqual(['Blue sky'])
		expect(
			titles(await Post.findMany({ where: { _search: 'sky or pears' } }, M)),
		).toStrictEqual(['Green pears', 'Blue sky'])
		expect(
			await Post.findMany({ where: { _search: ' - "" ' } }, M),
		).toStrictEqual([])
		expect(
			await Post.count({ where: { NOT: apple, OR: [{ rank: 3 }] } }, M),
		).toBe(1)
		const ada = await Author.findFirst(
			{
				where: { posts: { some: { _search: 'orchards' } } },
				include: {
					posts: { where: apple, orderBy: { _relevance: 'desc' } },
				},
			},
			M,
		)
		expect(titles(ada?.posts ?? [])).toStrictEqual(['Apple trees'])
		const { count } = await Post.updateMany(
			{ where: { _search: 'sky' }, data: { rank: 9 } },
			M,
		)
		expect(count).toBe(1)
		expect(
			await Post.aggregate({ where: apple, _sum: { rank: true } }, M),
		).toMatchObject({ _sum: { rank: 7 } })
		expect(
			(await Post.deleteMany({ where: { _search: 'pears' } }, M)).count,
		).toBe(1)
	})

	// As `ts_rank`, by how often each word occurs, not where.
	it('sorts by relevance at the top of a read, with a cursor and distinct', async () => {
		const orderBy = [{ _relevance: 'desc' }, { rank: 'desc' }] as const
		const ranked = await Post.findMany(
			{ where: { _search: 'apple' }, orderBy },
			M,
		)
		expect(titles(ranked)).toStrictEqual([
			'Red apples',
			'Apple trees',
			'Green pears',
		])
		const [, second] = ranked
		const after = await Post.findMany(
			{
				where: { _search: 'apple' },
				orderBy,
				cursor: { id: second?.id ?? '' },
				skip: 1,
			},
			M,
		)
		expect(titles(after)).toStrictEqual(['Green pears'])
		const first = await Post.findFirst(
			{
				where: { _search: 'apple' },
				orderBy: [{ _relevance: 'asc' }, { rank: 'asc' }],
			},
			M,
		)
		expect(first?.title).toBe('Green pears')
		const distinct = await Post.findMany(
			{
				where: { _search: 'apple' },
				orderBy: { _relevance: 'desc' },
				distinct: ['author'],
			},
			M,
		)
		expect(titles(distinct)).toStrictEqual(['Red apples', 'Apple trees'])
	})

	it('refuses a search it cannot run', async () => {
		const loose: {
			findMany(args: object, options: typeof M): Promise<unknown>
			findUnique(args: object, options: typeof M): Promise<unknown>
			groupBy(args: object, options: typeof M): Promise<unknown>
		} = Post
		const authors: {
			findMany(args: object, options: typeof M): Promise<unknown>
		} = Author
		const cases: [Promise<unknown>, string][] = [
			[
				loose.findMany({ where: { _search: 1 } }, M),
				'where._search must be a clean string.',
			],
			[
				loose.findMany({ where: { _search: 'a\u0000' } }, M),
				'where._search must be a clean string.',
			],
			[
				loose.findMany({ orderBy: { _relevance: 'desc' } }, M),
				"orderBy._relevance sorts by the _search at the top of the read's where, which has none.",
			],
			[
				loose.findMany(
					{
						where: { OR: [{ _search: 'apple' }] },
						orderBy: { _relevance: 'desc' },
					},
					M,
				),
				'orderBy._relevance',
			],
			[
				loose.findMany(
					{
						where: { _search: 'apple' },
						orderBy: { _relevance: 'sideways' },
					},
					M,
				),
				'orderBy._relevance',
			],
			[
				loose.findMany(
					{
						where: { _search: 'apple' },
						orderBy: { _relevance: { sort: 'desc', nulls: 'last' } },
					},
					M,
				),
				"orderBy._relevance must be 'asc' or 'desc'.",
			],
			[
				authors.findMany({ orderBy: { posts: { _relevance: 'desc' } } }, M),
				'orderBy.posts',
			],
			[
				loose.findMany(
					{
						where: { _search: 'x' },
						orderBy: { author: { _relevance: 'desc' } },
					},
					M,
				),
				'orderBy.author._relevance',
			],
			[
				loose.groupBy(
					{
						by: ['rank'],
						where: { _search: 'apple' },
						orderBy: { _relevance: 'desc' },
					},
					M,
				),
				'orderBy',
			],
			[loose.findUnique({ where: { _search: 'apple' } }, M), 'where'],
			[authors.findMany({ where: { _search: 'Ada' } }, M), 'where._search'],
		]
		for (const [failed, message] of cases) {
			await expect(failed).rejects.toMatchObject({ code: 'INVALID_QUERY' })
			await expect(failed).rejects.toThrow(message)
		}
	})

	it('refuses a field a search would reveal, a list and the kernel names', async () => {
		const Bad = defineModel({
			name: 'Bad',
			fields: (f) => ({
				note: f.string({ search: true }).with({
					access: { read: () => false },
				}),
			}),
		})
		const bad = defineApp({ database: memory(), models: [Bad] })
		await expect(bad.start()).rejects.toThrow(
			'Bad.note has a read rule, and a search would reveal its value: remove search or the rule.',
		)
		// Everyone reads it: no read rule (D-176).
		const Open = defineModel({
			name: 'Open',
			fields: (f) => ({
				note: f.string({ search: true }).with({ access: allow.readOnly }),
			}),
		})
		await app.stop()
		app = defineApp({ database: memory(), models: [Open] })
		await app.start()
		for (const name of ['_search', '_relevance']) {
			expect(() =>
				defineModel({ name: 'Bad', fields: (f) => ({ [name]: f.string() }) }),
			).toThrow(`Bad.${name}: the kernel owns this name.`)
		}
		expect(() =>
			defineModel({
				name: 'Bad',
				// @ts-expect-error: a list is not searched.
				fields: (f) => ({ tags: f.string({ list: true, search: true }) }),
			}),
		).toThrow('search takes a string field that is not a list.')
	})

	it('types _search and _relevance on a model with searched fields alone', () => {
		type PostWhere = NonNullable<
			NonNullable<Parameters<typeof Post.findMany>[0]>['where']
		>
		expectTypeOf<PostWhere['_search']>().toEqualTypeOf<string | undefined>()
		type AuthorWhere = NonNullable<
			NonNullable<Parameters<typeof Author.findMany>[0]>['where']
		>
		expectTypeOf<AuthorWhere>().not.toHaveProperty('_search')
		void Author.findMany(
			// @ts-expect-error: Author has no searched field.
			{ orderBy: { _relevance: 'desc' } },
			M,
		).catch(() => undefined)
	})
})
