import { App } from './app.ts'
import { Genre } from './genre.ts'

//#region author
export const Author = App.Schema.define({
	className: 'Author',
	fields: (field) => ({
		firstName: field.string({ required: true }),
		lastName: field.string({ required: true }),
		// Computed for each result that selects it, never stored. Inside
		// `fields`, dependency values are typed `unknown`: convert them.
		displayName: field.virtual({
			output: (output) => output.string({ nullable: false }),
			select: { firstName: true, lastName: true },
			resolve: ({ item }) =>
				`${String(item.firstName)} ${String(item.lastName)}`,
		}),
		// Inverse side: the books whose `author` pointer targets this author.
		books: field.relation({ target: () => Book, mappedBy: 'author' }),
	}),
})
//#endregion author

//#region book
/** One field of each built-in value kind, and two composite indexes. */
export const Book = App.Schema.define({
	className: 'Book',
	fields: (field) => ({
		title: field.string({ required: true }),
		isbn: field.string({
			description: 'ISBN-13 without hyphens',
			immutable: true,
			indexed: 'unique',
			required: true,
		}),
		author: field.pointer({ target: () => Author, required: true }),
		price: field.decimal({ precision: 10, scale: 2, required: true }),
		genre: field.enum({ values: Genre, required: true }),
		format: field.enum({
			values: ['paperback', 'hardcover', 'ebook'],
			default: 'paperback',
		}),
		tags: field.string({ list: true }),
		pages: field.int(),
		weightKg: field.float(),
		publishedOn: field.date(),
		published: field.boolean({ default: false }),
		cover: field.binary(),
		details: field.json(),
	}),
	indexes: [
		// An author never has two books with the same title.
		{ fields: ['author', 'title'], unique: true },
		// Serves "the latest books of a genre".
		{ fields: ['genre', 'createdAt'] },
	],
})
//#endregion book
