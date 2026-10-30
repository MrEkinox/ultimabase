// Writes and reads the relations from server code, as Master, each test on a
// new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { InvalidQuery, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { app } from './app.ts'
import { Author, Book, Publisher, Tag } from './models.ts'

testApplication(app)

/** The book of a title. */
const titled = (title: string) =>
	Book.findFirstOrThrow({ where: { title } }, { as: master })

/** The names of authors, in order. */
const names = (authors: readonly { name: string }[]) =>
	authors.map((author) => author.name)

/** Two authors, their books at Ace, and the books' tags. */
async function library() {
	//#region create
	const ace = await Publisher.create({ data: { name: 'Ace' } }, { as: master })
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
		{ as: master },
	)
	//#endregion
	//#region connect-one
	const octavia = await Author.create(
		{ data: { name: 'Octavia E. Butler' } },
		{ as: master },
	)
	const kindred = await Book.create(
		{
			data: {
				title: 'Kindred',
				author: { connect: { id: octavia.id } },
				publisher: { connect: { id: ace.id } },
			},
		},
		{ as: master },
	)
	//#endregion
	const dispossessed = await titled('The Dispossessed')
	const lathe = await titled('The Lathe of Heaven')
	const classic = await Tag.findUniqueOrThrow(
		{ where: { label: 'classic' } },
		{ as: master },
	)
	return { ace, ursula, octavia, kindred, dispossessed, lathe, classic }
}

/** The labels of a book's tags, sorted. */
const labels = async (id: string) =>
	(
		await Book.findUniqueOrThrow(
			{ where: { id }, include: { tags: { orderBy: { label: 'asc' } } } },
			{ as: master },
		)
	).tags.map((tag) => tag.label)

describe('writing relations', () => {
	it('links and unlinks rows from either side', async () => {
		const { lathe, classic } = await library()
		//#region connect
		await Book.update(
			{
				where: { id: lathe.id },
				data: { tags: { connect: [{ id: classic.id }] } },
			},
			{ as: master },
		)
		// The same link, written from the other side:
		await Tag.update(
			{
				where: { id: classic.id },
				data: { books: { disconnect: [{ id: lathe.id }] } },
			},
			{ as: master },
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
			{ as: master },
		)
		//#endregion
		const moved = await Book.findUniqueOrThrow(
			{ where: { id: kindred.id }, include: { author: true } },
			{ as: master },
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
			{ as: master },
		)
		//#endregion
		expect(await labels(dispossessed.id)).toEqual(['classic'])
		//#region connect-or-create
		await Book.update(
			{
				where: { id: dispossessed.id },
				data: {
					tags: {
						connectOrCreate: [
							{ where: { label: 'utopia' }, create: { label: 'utopia' } },
							{ where: { label: 'anarchy' }, create: { label: 'anarchy' } },
						],
					},
				},
			},
			{ as: master },
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
		//#region update-delete
		await Author.update(
			{
				where: { id: ursula.id },
				data: {
					books: {
						update: [
							{
								where: { id: dispossessed.id },
								data: { title: 'The Dispossessed: An Ambiguous Utopia' },
							},
						],
						delete: [{ id: lathe.id }],
					},
				},
			},
			{ as: master },
		)
		//#endregion
		const books = await Book.findMany(
			{ where: { author: { is: { id: ursula.id } } } },
			{ as: master },
		)
		expect(books.map((book) => book.title)).toEqual([
			'The Dispossessed: An Ambiguous Utopia',
		])
	})
})

describe('reading relations', () => {
	it('includes and selects related rows', async () => {
		const { ursula } = await library()
		//#region include
		const author = await Author.findUniqueOrThrow(
			{
				where: { id: ursula.id },
				include: {
					books: {
						orderBy: { title: 'asc' },
						take: 10,
						include: { publisher: true, tags: true },
					},
				},
			},
			{ as: master },
		)
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
			{ as: master },
		)
		expect(books).toEqual([
			{ title: 'Kindred', author: { name: 'Octavia E. Butler' } },
		])
		//#endregion
	})

	it('filters through relations', async () => {
		await library()
		//#region filter
		// `is` and `isNot` on a `one`
		const hers = await Book.findMany(
			{ where: { author: { is: { name: 'Octavia E. Butler' } } } },
			{ as: master },
		)
		expect(hers.map((book) => book.title)).toEqual(['Kindred'])
		// `some`, `every` and `none` on a `many`
		const withClassic = await Author.findMany(
			{ where: { books: { some: { tags: { some: { label: 'classic' } } } } } },
			{ as: master },
		)
		expect(names(withClassic)).toEqual(['Ursula K. Le Guin'])
		const untagged = await Author.findMany(
			{ where: { books: { every: { tags: { none: {} } } } } },
			{ as: master },
		)
		expect(names(untagged)).toEqual(['Octavia E. Butler'])
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
			{ as: master },
		)
		expect(authors.map((author) => [author.name, author._count.books])).toEqual(
			[
				['Ursula K. Le Guin', 2],
				['Octavia E. Butler', 1],
			],
		)
		//#endregion
		//#region order-through
		const books = await Book.findMany(
			{ orderBy: [{ author: { name: 'asc' } }, { title: 'asc' }] },
			{ as: master },
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
		await Author.delete({ where: { id: ursula.id } }, { as: master })
		expect(await Book.count({}, { as: master })).toBe(1)
		expect(await Tag.count({}, { as: master })).toBe(2)
		//#endregion
	})

	it('keeps a publisher while a book references it', async () => {
		const { ace } = await library()
		//#region restrict
		await expect(
			Publisher.delete({ where: { id: ace.id } }, { as: master }),
		).rejects.toMatchObject({
			code: 'RELATION_RESTRICTED',
			message: 'Book.publisher references a Publisher the delete removes.',
		})
		//#endregion
	})
})

describe('refused writes', () => {
	it('refuses a link to a missing row, or back to the row being created', async () => {
		const { ace, ursula } = await library()
		//#region refused
		await expect(
			Book.create(
				{
					data: {
						title: 'The Word for World Is Forest',
						author: { connect: { id: ursula.id } },
						publisher: {
							connect: { id: '01890000-0000-7000-8000-000000000000' },
						},
					},
				},
				{ as: master },
			),
		).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'A connected Publisher does not exist.',
		})
		await expect(
			Publisher.create(
				{
					data: {
						name: 'Tor',
						books: {
							create: [
								{
									title: 'The Left Hand of Darkness',
									author: { connect: { id: ursula.id } },
									// @ts-expect-error -- the publisher is the one being created
									publisher: { connect: { id: ace.id } },
								},
							],
						},
					},
				},
				{ as: master },
			),
		).rejects.toThrow(InvalidQuery)
		//#endregion
	})
})
