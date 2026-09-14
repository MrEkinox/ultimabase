import { Schema } from '@ultimabase/core'

export const Author = Schema.define({
	className: 'DocsAuthor',
	fields: (field) => ({
		name: field.string({ required: true }),
		posts: field.relation({ mappedBy: 'author', target: 'DocsPost' }),
	}),
})

export const Post = Schema.define({
	className: 'DocsPost',
	fields: (field) => ({
		author: field.pointer({
			onDelete: 'restrict',
			required: true,
			target: 'DocsAuthor',
		}),
		reviewers: field.relation({ target: 'DocsAuthor' }),
		title: field.string({ required: true }),
	}),
})
