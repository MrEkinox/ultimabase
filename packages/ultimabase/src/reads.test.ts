import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { master } from './index.ts'
import { query } from './engine.ts'
import { Author, Book, Tag, library } from './test/library.ts'

const as = { as: master }
let app: ReturnType<typeof library>

beforeEach(async () => {
	app = library()
	await app.start()
	const ada = await Author.create({ data: { name: 'Ada' } }, as)
	const grace = await Author.create(
		{ data: { name: 'Grace', level: 'senior' } },
		as,
	)
	const math = await Tag.create({ data: { label: 'math' } }, as)
	const books = [
		{ title: 'Analysis', pages: 300, author: ada, tags: [math] },
		{ title: 'Engines', pages: 120, author: ada, tags: [] },
		{ title: 'Compilers', pages: null, author: grace, tags: [math] },
	]
	for (const { author, tags, ...data } of books) {
		await Book.create(
			{
				data: {
					...data,
					author: { connect: { id: author.id } },
					tags: { connect: tags.map((tag) => ({ id: tag.id })) },
					meta: { kind: 'book' },
					releasedAt: new Date(2020, 0, data.title.length),
				},
			},
			as,
		)
	}
})
afterEach(async () => {
	await app.stop()
})

const titles = async (args: object): Promise<unknown[]> => {
	const rows: unknown = await query('Book', 'findMany', args, as)
	return Array.isArray(rows)
		? rows.map((row: { readonly title?: unknown }) => row.title)
		: []
}

describe('where', () => {
	it('filters on values and operators', async () => {
		expect(await titles({ where: { pages: { gt: 150 } } })).toEqual([
			'Analysis',
		])
		expect(await titles({ where: { title: { startsWith: 'C' } } })).toEqual([
			'Compilers',
		])
		expect(await titles({ where: { title: { contains: 'gin' } } })).toEqual([
			'Engines',
		])
		expect(
			await titles({ where: { title: { in: ['Engines', 'Compilers'] } } }),
		).toEqual(['Engines', 'Compilers'])
	})

	it('treats null as a value and as unknown in comparisons', async () => {
		expect(await titles({ where: { pages: null } })).toEqual(['Compilers'])
		expect(await titles({ where: { pages: { not: null } } })).toEqual([
			'Analysis',
			'Engines',
		])
		// `null` is never below 200, nor not below it.
		expect(await titles({ where: { NOT: { pages: { lt: 200 } } } })).toEqual([
			'Analysis',
		])
	})

	it('combines AND, OR and NOT', async () => {
		expect(
			await titles({
				where: {
					OR: [{ pages: { lt: 200 } }, { title: 'Analysis' }],
					NOT: [{ title: 'Engines' }],
				},
			}),
		).toEqual(['Analysis'])
	})

	it('filters through relations', async () => {
		expect(
			await titles({ where: { author: { is: { level: 'senior' } } } }),
		).toEqual(['Compilers'])
		expect(
			await titles({ where: { tags: { none: { label: 'math' } } } }),
		).toEqual(['Engines'])
		const authors = await Author.findMany(
			{
				where: { books: { every: { pages: { gt: 100 } } } },
				select: { name: true },
			},
			as,
		)
		// Grace's book has no pages: unknown is not false, as in PostgreSQL.
		expect(authors).toEqual([{ name: 'Ada' }, { name: 'Grace' }])
	})

	it('compares dates and whole json values', async () => {
		expect(
			await titles({ where: { releasedAt: { lt: new Date(2020, 0, 8) } } }),
		).toEqual(['Engines'])
		// An object on json is a filter, as in Prisma.
		await expect(
			titles({ where: { meta: { kind: 'book' } } }),
		).rejects.toMatchObject({ path: 'where.meta.kind' })
		expect(
			await titles({ where: { meta: { equals: { kind: 'book' } } } }),
		).toHaveLength(3)
	})

	it('fails on an unknown field or operator with its path', async () => {
		await expect(titles({ where: { titel: 'A' } })).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			path: 'where.titel',
		})
		await expect(
			titles({ where: { title: { gt: 'A' } } }),
		).rejects.toMatchObject({ path: 'where.title.gt' })
		await expect(titles({ where: { pages: 'many' } })).rejects.toMatchObject({
			path: 'where.pages',
		})
	})

	it('ignores undefined values (D-84)', async () => {
		expect(await titles({ where: { title: undefined } })).toHaveLength(3)
	})
})

describe('order and pages', () => {
	it('orders, skips and takes', async () => {
		expect(await titles({ orderBy: { title: 'desc' } })).toEqual([
			'Engines',
			'Compilers',
			'Analysis',
		])
		expect(
			await titles({ orderBy: [{ title: 'asc' }], skip: 1, take: 1 }),
		).toEqual(['Compilers'])
	})

	it('takes backwards from a cursor', async () => {
		const engines = await Book.findFirst(
			{ where: { title: 'Engines' }, select: { id: true } },
			as,
		)
		expect(await titles({ cursor: { id: engines?.id }, take: -2 })).toEqual([
			'Analysis',
			'Engines',
		])
		expect(await titles({ cursor: { id: engines?.id }, skip: 1 })).toEqual([
			'Compilers',
		])
	})

	it('puts nulls last in ascending order, as PostgreSQL does', async () => {
		expect(await titles({ orderBy: { pages: 'asc' } })).toEqual([
			'Engines',
			'Analysis',
			'Compilers',
		])
		expect(await titles({ orderBy: { pages: 'desc' } })).toEqual([
			'Compilers',
			'Analysis',
			'Engines',
		])
	})
})

describe('select and include', () => {
	it('returns scalars by default and relations on demand', async () => {
		const author = await Author.findUnique(
			{
				where: { name: 'Ada' },
				include: {
					books: { select: { title: true }, orderBy: { pages: 'desc' } },
				},
			},
			as,
		)
		expect(author?.books).toEqual([{ title: 'Analysis' }, { title: 'Engines' }])
		expect(Object.keys(author ?? {}).toSorted()).toEqual([
			'books',
			'createdAt',
			'id',
			'level',
			'name',
			'updatedAt',
		])
	})

	it('selects nested relations', async () => {
		const book = await Book.findFirst(
			{
				where: { title: 'Compilers' },
				select: {
					title: true,
					author: { select: { name: true } },
					tags: { select: { label: true } },
				},
			},
			as,
		)
		expect(book).toEqual({
			title: 'Compilers',
			author: { name: 'Grace' },
			tags: [{ label: 'math' }],
		})
	})

	it('cannot take select and include together', async () => {
		const found = query(
			'Book',
			'findMany',
			{ select: { title: true }, include: { author: true } },
			as,
		)
		await expect(found).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})
})

describe('single rows and counts', () => {
	it('finds by a unique index and counts', async () => {
		const author = await Author.findUnique({ where: { name: 'Ada' } }, as)
		const book = await Book.findUnique(
			{ where: { title: 'Engines', author: author?.id ?? '' } },
			as,
		)
		expect(book?.pages).toBe(120)
		expect(await Book.findUnique({ where: { id: 'missing' } }, as)).toBeNull()
		expect(await Book.findFirst({ where: { pages: 1 } }, as)).toBeNull()
		expect(await Book.count({ where: { published: false } }, as)).toBe(3)
	})

	it('throws NOT_FOUND from an OrThrow read that finds nothing (D-135)', async () => {
		const found = await Book.findUniqueOrThrow(
			{
				where: {
					title: 'Engines',
					author: (
						await Author.findFirstOrThrow({ where: { name: 'Ada' } }, as)
					).id,
				},
			},
			as,
		)
		expect(found.pages).toBe(120)
		const first = await Book.findFirstOrThrow(
			{ where: { pages: { gt: 200 } }, select: { title: true } },
			as,
		)
		expect(first).toEqual({ title: 'Analysis' })
		const missing = { code: 'NOT_FOUND', message: 'No Book matches.' }
		await expect(
			Book.findUniqueOrThrow({ where: { id: 'missing' } }, as),
		).rejects.toMatchObject(missing)
		await expect(
			Book.findFirstOrThrow({ where: { pages: 1 } }, as),
		).rejects.toMatchObject(missing)
	})

	it('returns stored dates and json as copies', async () => {
		const first = await Book.findFirst({ where: { title: 'Analysis' } }, as)
		first?.releasedAt?.setFullYear(1990)
		const again = await Book.findFirst({ where: { title: 'Analysis' } }, as)
		expect(again?.releasedAt?.getFullYear()).toBe(2020)
	})
})
