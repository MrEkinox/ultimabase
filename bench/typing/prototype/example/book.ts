// The other side of the cycle (relations.ts).
import { defineModel, many, number, one, string } from '../index.ts'
import { Author } from './author.ts'

export const Book = defineModel({
	name: 'Book',
	fields: {
		title: string(),
		pages: number({ optional: true }),
		author: one(() => Author),
		reviewer: one(() => Author, { optional: true }),
		sequels: many(() => Book),
	},
}).with({
	access: {
		read: ({ where }) =>
			where({ author: { is: { books: { some: { pages: { gt: 10 } } } } } }),
		update: ({ record }) => record.title !== '',
	},
	hooks: {
		beforeCreate: async ({ data }) => {
			const author = await Author.findUnique({
				where: { id: data.author.connect.id },
				include: { books: { select: { title: true, pages: true } } },
			})
			const pages: (number | null)[] =
				author?.books.map((book) => book.pages) ?? []
			void pages
			// @ts-expect-error: `level` was not selected in `books`.
			void author?.books[0]?.author
		},
	},
})
