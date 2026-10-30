import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { master } from './index.ts'
import { query } from './engine.ts'
import { Author, Book, library } from './test/library.ts'

const as = { as: master }
const read = async (args: object) => query('Book', 'findMany', args, as)
let app: ReturnType<typeof library>

beforeEach(async () => {
	app = library()
	await app.start()
	const ada = await Author.create({ data: { name: 'Ada' } }, as)
	await Book.create(
		{
			data: {
				title: 'Analysis',
				pages: 300,
				meta: { kind: 'book' },
				author: { connect: { id: ada.id } },
			},
		},
		as,
	)
})
afterEach(async () => {
	await app.stop()
})

// Never called: checks what the types refuse (D-135).
async function refused() {
	// @ts-expect-error -- select and omit exclude each other
	await Book.findMany({ select: { title: true }, omit: { pages: true } }, as)
	// @ts-expect-error -- a relation is not a field omit leaves out
	await Book.findMany({ omit: { author: true } }, as)
	// @ts-expect-error -- a delete takes no data
	await Book.delete({ where: { id: '' }, data: {} }, as)
}

describe('omit (D-135)', () => {
	it('leaves fields out of the rows and of their type', async () => {
		const [book] = await Book.findMany(
			{ omit: { meta: true, pages: true, id: true, published: false } },
			as,
		)
		expect(Object.keys(book ?? {}).toSorted()).toEqual([
			'createdAt',
			'published',
			'releasedAt',
			'title',
			'updatedAt',
		])
		type Row = NonNullable<typeof book>
		expectTypeOf<keyof Row>().toEqualTypeOf<
			'createdAt' | 'published' | 'releasedAt' | 'title' | 'updatedAt'
		>()
		expectTypeOf(refused).toBeFunction()
	})

	it('goes with include, in a relation and in a write', async () => {
		const author = await Author.findUniqueOrThrow(
			{
				where: { name: 'Ada' },
				omit: { level: true },
				include: { books: { omit: { meta: true } } },
			},
			as,
		)
		expect('level' in author).toBe(false)
		expect(author.books.map((book) => 'meta' in book)).toEqual([false])
		expectTypeOf(author).not.toHaveProperty('level')
		const book = await Book.findFirstOrThrow(
			{ include: { author: { omit: { name: true } } } },
			as,
		)
		expect(book.author).not.toHaveProperty('name')
		const updated = await Book.update(
			{ where: { id: book.id }, data: { pages: 310 }, omit: { title: true } },
			as,
		)
		expect(updated).not.toHaveProperty('title')
		expect(updated.pages).toBe(310)
		const removed = await Book.delete(
			{
				where: { id: book.id },
				omit: { pages: true },
				include: { author: true },
			},
			as,
		)
		expect(removed).not.toHaveProperty('pages')
		expect(removed.author?.name).toBe('Ada')
		expectTypeOf(removed).not.toHaveProperty('pages')
		expectTypeOf(removed.author?.name).toEqualTypeOf<string | undefined>()
	})

	it('refuses select beside it, a relation and a value not a boolean', async () => {
		await expect(
			read({ select: { title: true }, omit: { pages: true } }),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message: 'select and omit cannot be used together.',
		})
		await expect(read({ omit: { author: true } })).rejects.toMatchObject({
			code: 'INVALID_QUERY',
		})
		await expect(read({ omit: { pages: 1 } })).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message: 'omit.pages must be a boolean.',
		})
		await expect(read({ omit: true })).rejects.toMatchObject({
			code: 'INVALID_QUERY',
		})
	})
})
