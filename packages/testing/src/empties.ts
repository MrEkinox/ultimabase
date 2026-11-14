// `empty()` in the contract (D-188): every model's rows go, join rows
// included, whatever references them; the tables stay, and take new rows.
// A database without migrations starts empty every time.
import type { Adapter, Identity } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { silent } from './silent.ts'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }

const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({
		name: f.string({ unique: true }),
		books: f.many(() => Book, { inverse: 'shelf' }),
	}),
})

const Book = defineModel({
	name: 'Book',
	fields: (f) => ({
		title: f.string(),
		shelf: f.one(() => Shelf, { onDelete: 'restrict' }),
		tags: f.many(() => Tag, { inverse: 'books' }),
	}),
})

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		text: f.string(),
		books: f.many(() => Book, { inverse: 'tags' }),
	}),
})

export function empties(create: () => Adapter): void {
	describe('empty', () => {
		const database = started(create, [Shelf, Book, Tag])

		it('removes every row, a restricted relation and join rows included', async () => {
			const shelf = await Shelf.create({ data: { name: 'Top' } }, M)
			await Book.create(
				{
					data: {
						title: 'Dune',
						shelf: { connect: { id: shelf.id } },
						tags: { create: [{ text: 'sf' }] },
					},
				},
				M,
			)
			await database().empty()
			expect(await Shelf.count({}, M)).toBe(0)
			expect(await Book.count({}, M)).toBe(0)
			expect(await Tag.count({}, M)).toBe(0)
		})

		it('keeps the tables, which take the same rows again', async () => {
			await Shelf.create({ data: { name: 'Top' } }, M)
			await database().empty()
			const shelf = await Shelf.create({ data: { name: 'Top' } }, M)
			const book = await Book.create(
				{
					data: {
						title: 'Dune',
						shelf: { connect: { id: shelf.id } },
						tags: { create: [{ text: 'sf' }] },
					},
				},
				M,
			)
			const read = await Book.findUnique(
				{
					where: { id: book.id },
					select: { tags: { select: { text: true } } },
				},
				M,
			)
			expect(read?.tags).toEqual([{ text: 'sf' }])
		})
	})

	// testApplication starts such a database as it is: rows it kept would
	// carry over from one test file to the next.
	describe('a restart', () => {
		it('leaves no row in a database without migrations', async () => {
			const database = create()
			const models = [Shelf, Book, Tag]
			const app = defineApp({ database, models, logger: silent })
			await app.start()
			await Shelf.create({ data: { name: 'Top' } }, M)
			await app.stop()
			await app.start()
			try {
				const kept = database.migrations === undefined
				expect(kept ? await Shelf.count({}, M) : 0).toBe(0)
			} finally {
				await app.stop()
			}
		})
	})
}
