// Writes and reads the relations from server code, as Master, each test on a
// new in-memory database. Its short regions are shown on the page (D-282).
import { testApplication } from '@ultimabase/testing'
import { InvalidQuery, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { app } from './app.ts'
import { Author, Book, Publisher, Tag } from './models.ts'

testApplication(app)

const as = { as: master }

/** The book of a title. */
const titled = (title: string) =>
	Book.findFirstOrThrow({ where: { title } }, as)

/** Two authors, their books at Ace, and the books' tags. */
async function library() {
	const ace = await Publisher.create({ data: { name: 'Ace' } }, as)
	// The author, her books and their tags, in one write.
	const ursula = await Author.create(
		{
			data: {
				name: 'Ursula K. Le Guin',
				books: {
					create: [
						{
							title: 'The Dispossessed',
							publisher: { connect: { id: ace.id } },
							tags: { create: [{ label: 'utopia' }, { label: 'classic' }] },
						},
						{
							title: 'The Lathe of Heaven',
							publisher: { connect: { id: ace.id } },
						},
					],
				},
			},
		},
		as,
	)
	const octavia = await Author.create(
		{ data: { name: 'Octavia E. Butler' } },
		as,
	)
	const kindred = await Book.create(
		{
			data: {
				title: 'Kindred',
				author: { connect: { id: octavia.id } },
				publisher: { connect: { id: ace.id } },
			},
		},
		as,
	)
	const dispossessed = await titled('The Dispossessed')
	const lathe = await titled('The Lathe of Heaven')
	const classic = await Tag.findUniqueOrThrow(
		{ where: { label: 'classic' } },
		as,
	)
	return { ace, ursula, octavia, kindred, dispossessed, lathe, classic }
}

/** The labels of a book's tags, sorted. */
const labels = async (id: string) =>
	(
		await Book.findUniqueOrThrow(
			{ where: { id }, include: { tags: { orderBy: { label: 'asc' } } } },
			as,
		)
	).tags.map((tag) => tag.label)

describe('writing relations', () => {
	it('creates a book with its author, its publisher and its tags', async () => {
		const { ace, octavia } = await library()
		//#region create
		const sower = await Book.create(
			{
				data: {
					title: 'Parable of the Sower',
					author: { connect: { id: octavia.id } },
					publisher: { connect: { id: ace.id } },
					tags: { create: [{ label: 'dystopia' }, { label: 'afrofuturism' }] },
				},
			},
			as,
		)
		//#endregion
		expect(await labels(sower.id)).toEqual(['afrofuturism', 'dystopia'])
	})

	it('links and unlinks rows from either side', async () => {
		const { lathe, classic } = await library()
		//#region connect
		await Book.update(
			{
				where: { id: lathe.id },
				data: { tags: { connect: [{ id: classic.id }] } },
			},
			as,
		)
		//#endregion
		expect(await labels(lathe.id)).toEqual(['classic'])
		//#region disconnect
		// The same link, removed from the other side:
		await Tag.update(
			{
				where: { id: classic.id },
				data: { books: { disconnect: [{ id: lathe.id }] } },
			},
			as,
		)
		//#endregion
		expect(await labels(lathe.id)).toEqual([])
	})

	it('moves a book to another author', async () => {
		const { kindred, ursula } = await library()
		//#region move
		await Book.update(
			{
				where: { id: kindred.id },
				data: { author: { connect: { id: ursula.id } } },
			},
			as,
		)
		//#endregion
		const moved = await Book.findUniqueOrThrow(
			{ where: { id: kindred.id }, include: { author: true } },
			as,
		)
		expect(moved.author?.name).toBe('Ursula K. Le Guin')
	})

	it('replaces a book’s tags, and links a tag or creates it', async () => {
		const { dispossessed, classic } = await library()
		//#region set
		await Book.update(
			{
				where: { id: dispossessed.id },
				data: { tags: { set: [{ id: classic.id }] } },
			},
			as,
		)
		//#endregion
		expect(await labels(dispossessed.id)).toEqual(['classic'])
		//#region connect-or-create
		const utopia = { where: { label: 'utopia' }, create: { label: 'utopia' } }
		const anarchy = {
			where: { label: 'anarchy' },
			create: { label: 'anarchy' },
		}
		await Book.update(
			{
				where: { id: dispossessed.id },
				data: { tags: { connectOrCreate: [utopia, anarchy] } },
			},
			as,
		)
		//#endregion
		expect(await labels(dispossessed.id)).toEqual([
			'anarchy',
			'classic',
			'utopia',
		])
	})

	it('updates and deletes an author’s books through her', async () => {
		const { ursula, dispossessed, lathe } = await library()
		//#region update
		await Author.update(
			{
				where: { id: ursula.id },
				data: {
					books: {
						update: [{ where: { id: lathe.id }, data: { title: 'Lathe' } }],
					},
				},
			},
			as,
		)
		//#endregion
		//#region delete
		await Author.update(
			{
				where: { id: ursula.id },
				data: { books: { delete: [{ id: dispossessed.id }] } },
			},
			as,
		)
		//#endregion
		const books = await Book.findMany(
			{ where: { author: { is: { id: ursula.id } } } },
			as,
		)
		expect(books.map((book) => book.title)).toEqual(['Lathe'])
	})
})

describe('reading relations', () => {
	it('includes and selects related rows', async () => {
		const { ursula } = await library()
		//#region include
		//#region include-books
		const author = await Author.findUniqueOrThrow(
			{
				where: { id: ursula.id },
				include: {
					books: { orderBy: { title: 'asc' }, include: { publisher: true } },
				},
			},
			as,
		)
		//#endregion
		expect(author.books.map((book) => book.title)).toEqual([
			'The Dispossessed',
			'The Lathe of Heaven',
		])
		expect(author.books[0]?.publisher?.name).toBe('Ace')
		//#endregion
		//#region select
		const books = await Book.findMany(
			{
				where: { title: 'Kindred' },
				select: { title: true, author: { select: { name: true } } },
			},
			as,
		)
		expect(books).toEqual([
			{ title: 'Kindred', author: { name: 'Octavia E. Butler' } },
		])
		//#endregion
	})

	it('filters through relations', async () => {
		await library()
		//#region filter-one
		// `is` and `isNot` on a `one`
		const hers = await Book.findMany(
			{ where: { author: { is: { name: 'Octavia E. Butler' } } } },
			as,
		)
		expect(hers.map((book) => book.title)).toEqual(['Kindred'])
		//#endregion
		//#region filter-many
		const withClassic = await Author.findMany(
			{ where: { books: { some: { tags: { some: { label: 'classic' } } } } } },
			as,
		)
		expect(withClassic.map((author) => author.name)).toEqual([
			'Ursula K. Le Guin',
		])
		const untagged = await Author.findMany(
			{ where: { books: { every: { tags: { none: {} } } } } },
			as,
		)
		expect(untagged.map((author) => author.name)).toEqual(['Octavia E. Butler'])
		//#endregion
	})

	it('counts related rows and sorts through relations', async () => {
		await library()
		//#region count
		const authors = await Author.findMany(
			{
				orderBy: { books: { _count: 'desc' } },
				include: { _count: { select: { books: true } } },
			},
			as,
		)
		expect(authors.map((author) => author._count.books)).toEqual([2, 1])
		//#endregion
		expect(authors.map((author) => [author.name, author._count.books])).toEqual(
			[
				['Ursula K. Le Guin', 2],
				['Octavia E. Butler', 1],
			],
		)
		//#region order-through
		const books = await Book.findMany(
			{ orderBy: [{ author: { name: 'asc' } }, { title: 'asc' }] },
			as,
		)
		expect(books.map((book) => book.title)).toEqual([
			'Kindred',
			'The Dispossessed',
			'The Lathe of Heaven',
		])
		//#endregion
	})
})

describe('deleting a target', () => {
	it('deletes an author’s books with her, and keeps their tags', async () => {
		const { ursula } = await library()
		//#region cascade
		await Author.delete({ where: { id: ursula.id } }, as)
		expect(await Book.count({}, as)).toBe(1)
		expect(await Tag.count({}, as)).toBe(2)
		//#endregion
	})

	it('keeps a publisher while a book references it', async () => {
		const { ace } = await library()
		//#region restrict
		await expect(
			Publisher.delete({ where: { id: ace.id } }, as),
		).rejects.toMatchObject({
			code: 'RELATION_RESTRICTED',
			message: 'Book.publisher references a Publisher the delete removes.',
		})
		//#endregion
	})
})

describe('refused writes', () => {
	it('refuses a link to a missing row', async () => {
		const { ursula } = await library()
		//#region missing
		const data = {
			title: 'The Word for World Is Forest',
			author: { connect: { id: ursula.id } },
			publisher: { connect: { id: '01890000-0000-7000-8000-000000000000' } },
		}
		await expect(Book.create({ data }, as)).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'A connected Publisher does not exist.',
		})
		//#endregion
	})

	it('refuses a link back to the row being created', async () => {
		const { ace, ursula } = await library()
		//#region back
		const book = {
			title: 'The Left Hand of Darkness',
			author: { connect: { id: ursula.id } },
			publisher: { connect: { id: ace.id } },
		}
		await expect(
			Publisher.create(
				// @ts-expect-error -- the publisher is the one being created
				{ data: { name: 'Tor', books: { create: [book] } } },
				as,
			),
		).rejects.toThrow(InvalidQuery)
		//#endregion
	})
})
