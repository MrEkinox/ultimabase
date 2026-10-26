// The other side of the cycle (relations.ts).
import { defineModel } from '../index.ts'
import { Author } from './author.ts'

export const Book = defineModel({
	name: 'Book',
	fields: (f) => ({
		title: f.string(),
		pages: f.number({ optional: true }),
		author: f.one(() => Author),
		reviewer: f.one(() => Author, { optional: true }),
		sequels: f.many(() => Book),
	}),
}).with({
	access: {
		read: ({ where }) =>
			where({ author: { is: { books: { some: { pages: { gt: 10 } } } } } }),
		update: ({ record }) => record.title !== '',
	},
	hooks: {
		beforeCreate: async ({ data }) => {
			// The author is connected or created with the book (D-128).
			if (!('connect' in data.author)) return
			const author = await Author.findUnique({
				where: { id: data.author.connect.id },
				include: { books: { select: { title: true, pages: true } } },
			})
			const pages: (number | null)[] =
				author?.books.map((book) => book.pages) ?? []
			void pages
			// @ts-expect-error: `author` was not selected in `books`.
			void author?.books[0]?.author
		},
	},
})
