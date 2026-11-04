// `empty()` in the contract (D-188): every model's rows go, join rows
// included, whatever references them; the tables stay, and take new rows.
import type { Adapter, Identity } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
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
}
