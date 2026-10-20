// One side of a two-file cycle (relations.ts): Author's own rules and hooks
// query Book and come back to Author, which must not make either `any`.
import { defineModel } from '../index.ts'
import { Book } from './book.ts'

export const Author = defineModel({
	name: 'Author',
	fields: (f) => ({
		name: f.string({ unique: true }),
		level: f.enumOf(['junior', 'senior']),
		books: f.many(() => Book, { inverse: 'author' }),
		favorite: f.one(() => Book, { optional: true }),
	}),
}).with({
	access: {
		read: ({ where }) =>
			where({ books: { some: { author: { is: { level: 'senior' } } } } }),
	},
	hooks: {
		afterCreate: async ({ record }) => {
			const books = await Book.findMany({
				where: { author: { is: { id: record.id } } },
				select: { title: true, author: { select: { name: true } } },
			})
			const names: string[] = books.map((book) => book.author.name)
			void names
			// @ts-expect-error: `pages` was not selected.
			void books[0]?.pages
		},
	},
})
