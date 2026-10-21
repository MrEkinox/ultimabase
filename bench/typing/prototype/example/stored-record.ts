// The stored row rules and hooks receive holds each `one` relation's key
// (D-77). `tsc` fails if one does not hold.
import { defineModel } from '../index.ts'
import { Author } from './author.ts'
import { Book } from './book.ts'

export const Review = defineModel({
	name: 'Review',
	fields: (f) => ({
		text: f.string(),
		author: f.one(() => Author),
		editor: f.one(() => Author, { optional: true }),
		books: f.many(() => Book),
	}),
}).with({
	access: {
		// Only the author changes a review: the rule reads the stored key.
		update: ({ caller, record }) =>
			caller.kind === 'user' && record.author.id === caller.user.id,
		delete: ({ caller, record }) =>
			caller.kind === 'user' && record.editor?.id === caller.user.id,
	},
	hooks: {
		afterUpdate: ({ record, previous }) => {
			const moved: boolean = record.author.id !== previous.author.id
			void moved
			// @ts-expect-error: an optional relation's key may be `null`.
			void record.editor.id
			// @ts-expect-error: a `many` relation has no key in the row.
			void record.books
		},
	},
})
