// The models: authors write books, a publisher prints them, tags sort them.
//#region models
import { graphql } from '@ultimabase/graphql'
import { allow, defineModel } from 'ultimabase'

export const Author = defineModel({
	name: 'Author',
	use: [graphql()],
	fields: (f) => ({
		name: f.string(),
		// One author, many books: `Book.author` is the other side.
		books: f.many(() => Book),
	}),
	// Open to every client, to keep the example on relations.
}).with({ access: allow.public })

export const Publisher = defineModel({
	name: 'Publisher',
	use: [graphql()],
	fields: (f) => ({ name: f.string(), books: f.many(() => Book) }),
}).with({ access: allow.public })

export const Tag = defineModel({
	name: 'Tag',
	use: [graphql()],
	fields: (f) => ({
		label: f.string({ unique: true }),
		// Many tags, many books: a join table holds the pairs.
		books: f.many(() => Book),
	}),
}).with({ access: allow.public })

export const Book = defineModel({
	name: 'Book',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		// Deleting an author deletes their books.
		author: f.one(() => Author, { onDelete: 'cascade' }),
		// Required and without `onDelete`: a publisher with books stays.
		publisher: f.one(() => Publisher),
		tags: f.many(() => Tag),
	}),
}).with({ access: allow.public })
//#endregion
