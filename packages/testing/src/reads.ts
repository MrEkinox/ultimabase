// The reads of the contract (D-20, D-73): every operator, AND, OR and NOT,
// filters through relations, order, pages and nested relations.
import type { Adapter, ArgsOf, WhereOf } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M = { as: master }

const Author = defineModel({
	name: 'Author',
	fields: (f) => ({
		name: f.string({ unique: true }),
		level: f.enumOf(['junior', 'senior'], { default: 'junior' }),
		books: f.many(() => Book),
		profile: f.one(() => Profile, { optional: true }),
	}),
})

const Profile = defineModel({
	name: 'Profile',
	fields: (f) => ({ bio: f.string(), author: f.one(() => Author) }),
})

const Book = defineModel({
	name: 'Book',
	fields: (f) => ({
		title: f.string(),
		pages: f.number({ optional: true }),
		published: f.boolean({ default: false }),
		meta: f.json({ optional: true }),
		releasedAt: f.dateTime({ optional: true }),
		author: f.one(() => Author),
		tags: f.many(() => Tag),
	}),
	indexes: [{ fields: ['title', 'author'], unique: true }],
})

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		label: f.string({ unique: true }),
		books: f.many(() => Book),
	}),
})

// Asymmetric matchers are typed `any`.
const aDate: unknown = expect.any(Date)

const day = (date: number): Date => new Date(Date.UTC(2020, 0, date))

type Authors = { readonly ada: string; readonly grace: string }

/** Ada wrote Analysis and Engines and has a profile; Grace wrote Compilers. */
async function seed(): Promise<Authors> {
	const ada = await Author.create({ data: { name: 'Ada' } }, M)
	const grace = await Author.create(
		{ data: { name: 'Grace', level: 'senior' } },
		M,
	)
	await Profile.create(
		{ data: { bio: 'Poet', author: { connect: { id: ada.id } } } },
		M,
	)
	const math = await Tag.create({ data: { label: 'math' } }, M)
	const art = await Tag.create({ data: { label: 'art' } }, M)
	const books = [
		{
			title: 'Analysis',
			pages: 300,
			published: true,
			author: ada,
			tags: [math],
		},
		{ title: 'Engines', pages: 120, author: ada, tags: [] },
		{ title: 'Compilers', pages: null, author: grace, tags: [math, art] },
	]
	for (const [index, { author, tags, ...data }] of books.entries()) {
		await Book.create(
			{
				data: {
					...data,
					meta: { rank: index, kind: 'book' },
					releasedAt: day(index + 1),
					author: { connect: { id: author.id } },
					tags: { connect: tags.map(({ id }) => ({ id })) },
				},
			},
			M,
		)
	}
	return { ada: ada.id, grace: grace.id }
}

const titles = async (where: WhereOf<typeof Book>): Promise<string[]> =>
	(await Book.findMany({ where }, M)).map((book) => book.title)
const names = async (where: WhereOf<typeof Author>): Promise<string[]> =>
	(await Author.findMany({ where }, M)).map((author) => author.name)
const ordered = async (
	orderBy: ArgsOf<typeof Book, 'findMany'>['orderBy'],
): Promise<string[]> =>
	(await Book.findMany({ orderBy }, M)).map((book) => book.title)
const page = async (args: ArgsOf<typeof Book, 'findMany'>): Promise<string[]> =>
	(await Book.findMany({ orderBy: { title: 'asc' }, ...args }, M)).map(
		(book) => book.title,
	)

export function reads(create: () => Adapter): void {
	describe('reads', () => {
		started(create, [Author, Profile, Book, Tag])

		let authors: Authors
		beforeEach(async () => {
			authors = await seed()
		})

		it('compares strings with every operator, case included', async () => {
			expect(await titles({ title: 'Engines' })).toEqual(['Engines'])
			expect(await titles({ title: { not: 'Engines' } })).toEqual([
				'Analysis',
				'Compilers',
			])
			expect(await titles({ title: { in: ['Compilers', 'Nope'] } })).toEqual([
				'Compilers',
			])
			expect(await titles({ title: { notIn: ['Analysis'] } })).toEqual([
				'Engines',
				'Compilers',
			])
			expect(await titles({ title: { notIn: [] } })).toHaveLength(3)
			expect(await titles({ title: { in: [] } })).toEqual([])
			expect(await titles({ title: { contains: 'gin' } })).toEqual(['Engines'])
			expect(await titles({ title: { contains: 'GIN' } })).toEqual([])
			expect(await titles({ title: { startsWith: 'C' } })).toEqual([
				'Compilers',
			])
			expect(await titles({ title: { endsWith: 'sis' } })).toEqual(['Analysis'])
			// `%` and `_` are characters, not patterns.
			expect(await titles({ title: { contains: '%' } })).toEqual([])
			expect(await titles({ title: { startsWith: '_' } })).toEqual([])
		})

		it('matches part of an id as a string', async () => {
			// An id begins with its time, shared by rows created together.
			const id = authors.ada
			expect(await names({ id: { startsWith: id.slice(0, 30) } })).toEqual([
				'Ada',
			])
			expect(await names({ id: { contains: id.slice(24, 32) } })).toEqual([
				'Ada',
			])
			expect(await names({ id: { endsWith: id.slice(24) } })).toEqual(['Ada'])
			expect(await names({ id: { contains: 'Z' } })).toEqual([])
		})

		it('compares numbers, dates, booleans, enums and json', async () => {
			expect(await titles({ pages: { lt: 300 } })).toEqual(['Engines'])
			expect(await titles({ pages: { lte: 300 } })).toEqual([
				'Analysis',
				'Engines',
			])
			expect(await titles({ pages: { gt: 120 } })).toEqual(['Analysis'])
			expect(await titles({ pages: { gte: 120 } })).toEqual([
				'Analysis',
				'Engines',
			])
			expect(await titles({ releasedAt: { gt: day(1) } })).toEqual([
				'Engines',
				'Compilers',
			])
			expect(await titles({ releasedAt: day(2) })).toEqual(['Engines'])
			expect(await titles({ published: true })).toEqual(['Analysis'])
			expect(
				await titles({ author: { is: { level: { in: ['senior'] } } } }),
			).toEqual(['Compilers'])
			// A json value equals another of the same content, keys in any order.
			expect(
				await titles({ meta: { equals: { kind: 'book', rank: 1 } } }),
			).toEqual(['Engines'])
		})

		it('takes -0 for 0 and gives it back as 0, in a number and in json, as PostgreSQL does', async () => {
			const { id } = await Book.create(
				{
					data: {
						title: 'Zero',
						pages: -0,
						meta: { rank: -0, list: [-0, 1] },
						author: { connect: { id: authors.grace } },
					},
				},
				M,
			)
			expect(await titles({ pages: 0 })).toEqual(['Zero'])
			expect(await titles({ pages: { in: [0] } })).toEqual(['Zero'])
			expect(await titles({ pages: { not: -0 } })).toEqual([
				'Analysis',
				'Engines',
			])
			expect(
				await titles({ meta: { equals: { list: [0, 1], rank: 0 } } }),
			).toEqual(['Zero'])
			// A json array keeps its order and its length.
			expect(
				await titles({ meta: { equals: { rank: 0, list: [1, 0] } } }),
			).toEqual([])
			expect(
				await titles({ meta: { equals: { rank: 0, list: [0] } } }),
			).toEqual([])
			expect(
				await titles({ meta: { equals: { kind: 'book', rank: -0 } } }),
			).toEqual(['Analysis'])
			// It comes back as 0, in json as in a number.
			const read = { where: { id }, select: { pages: true, meta: true } }
			expect(await Book.findUnique(read, M)).toStrictEqual({
				pages: 0,
				meta: { rank: 0, list: [0, 1] },
			})
			await Book.update({ where: { id }, data: { meta: -0 } }, M)
			expect(await Book.findUnique(read, M)).toStrictEqual({
				pages: 0,
				meta: 0,
			})
		})

		it('treats null as a value, and as unknown in a comparison', async () => {
			expect(await titles({ pages: null })).toEqual(['Compilers'])
			expect(await titles({ pages: { not: null } })).toEqual([
				'Analysis',
				'Engines',
			])
			// `null` is not below 200, nor not below it, as in SQL.
			expect(await titles({ NOT: { pages: { lt: 200 } } })).toEqual([
				'Analysis',
			])
			expect(await titles({ pages: { not: 300 } })).toEqual(['Engines'])
		})

		it('combines AND, OR and NOT', async () => {
			expect(
				await titles({
					OR: [{ pages: { lt: 200 } }, { title: 'Analysis' }],
					NOT: [{ title: 'Engines' }],
				}),
			).toEqual(['Analysis'])
			expect(
				await titles({ AND: [{ pages: { gt: 100 } }, { published: false }] }),
			).toEqual(['Engines'])
			expect(await titles({ OR: [] })).toEqual([])
		})

		it('filters through a one relation', async () => {
			expect(await titles({ author: { is: { name: 'Grace' } } })).toEqual([
				'Compilers',
			])
			expect(await titles({ author: { isNot: { name: 'Grace' } } })).toEqual([
				'Analysis',
				'Engines',
			])
			expect(await names({ profile: { is: null } })).toEqual(['Grace'])
			expect(await names({ profile: { isNot: null } })).toEqual(['Ada'])
			expect(await names({ profile: { is: { bio: 'Poet' } } })).toEqual(['Ada'])
		})

		it('filters through a many relation', async () => {
			expect(await titles({ tags: { some: { label: 'art' } } })).toEqual([
				'Compilers',
			])
			expect(await titles({ tags: { none: { label: 'math' } } })).toEqual([
				'Engines',
			])
			// Every tag of a book without tags is art.
			expect(await titles({ tags: { every: { label: 'art' } } })).toEqual([
				'Engines',
			])
			// Grace's book has no pages: unknown is not false, as in SQL.
			expect(await names({ books: { every: { pages: { gt: 200 } } } })).toEqual(
				['Grace'],
			)
		})

		it('orders by several fields, nulls last ascending', async () => {
			expect(await ordered({ pages: 'asc' })).toEqual([
				'Engines',
				'Analysis',
				'Compilers',
			])
			expect(await ordered({ pages: 'desc' })).toEqual([
				'Compilers',
				'Analysis',
				'Engines',
			])
			expect(await ordered([{ published: 'asc' }, { title: 'desc' }])).toEqual([
				'Engines',
				'Compilers',
				'Analysis',
			])
			// Without an order, rows come in the order they were created.
			expect(await ordered([])).toEqual(['Analysis', 'Engines', 'Compilers'])
		})

		it('orders strings by code point, as the bytes of their UTF-8', async () => {
			// UTF-16 puts U+FF5A above U+1F600, which is above it as a code point.
			await Tag.create({ data: { label: '😀' } }, M)
			await Tag.create({ data: { label: 'ｚ' } }, M)
			const tags = await Tag.findMany({ orderBy: { label: 'asc' } }, M)
			expect(tags.map(({ label }) => label)).toEqual([
				'art',
				'math',
				'ｚ',
				'😀',
			])
		})

		it('skips, takes and starts at a cursor, forwards and backwards', async () => {
			expect(await page({ skip: 1, take: 1 })).toEqual(['Compilers'])
			expect(await page({ take: -2 })).toEqual(['Compilers', 'Engines'])
			// A cursor is any unique key, here the index on title and author.
			const cursor = { title: 'Compilers', author: authors.grace }
			expect(await page({ cursor, take: 2 })).toEqual(['Compilers', 'Engines'])
			expect(await page({ cursor, skip: 1 })).toEqual(['Engines'])
			expect(await page({ cursor, take: -2 })).toEqual([
				'Analysis',
				'Compilers',
			])
		})

		it('includes relations, filtered, ordered and paged, at any depth', async () => {
			const ada = await Author.findUnique(
				{
					where: { name: 'Ada' },
					include: {
						profile: true,
						books: {
							where: { pages: { gt: 100 } },
							orderBy: { pages: 'asc' },
							take: 1,
							include: { tags: { orderBy: { label: 'asc' } } },
						},
					},
				},
				M,
			)
			expect(ada).toMatchObject({
				profile: { bio: 'Poet' },
				// An array matches only an array of the same length.
				books: [{ title: 'Engines', tags: [] }],
			})
			const compilers = await Book.findFirst(
				{
					where: { title: 'Compilers' },
					select: {
						title: true,
						author: { select: { name: true, profile: true } },
						tags: { select: { label: true }, orderBy: { label: 'asc' } },
					},
				},
				M,
			)
			expect(compilers).toEqual({
				title: 'Compilers',
				author: { name: 'Grace', profile: null },
				tags: [{ label: 'art' }, { label: 'math' }],
			})
		})

		it('finds a row by a unique index', async () => {
			const engines = await Book.findUnique(
				{ where: { title: 'Engines', author: authors.ada } },
				M,
			)
			expect(engines).toMatchObject({ title: 'Engines', pages: 120 })
			expect(await Book.findUnique({ where: { id: 'missing' } }, M)).toBeNull()
		})

		it('returns each type as written, and counts', async () => {
			const analysis = await Book.findFirst({ where: { title: 'Analysis' } }, M)
			expect(analysis).toMatchObject({
				pages: 300,
				published: true,
				meta: { rank: 0, kind: 'book' },
				releasedAt: day(1),
				createdAt: aDate,
			})
			expect(await Book.count({}, M)).toBe(3)
			expect(await Book.count({ where: { tags: { some: {} } } }, M)).toBe(2)
		})
	})
}
