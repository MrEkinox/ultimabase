import { Schema } from '@ultimabase/core'

export const Author = Schema.define({
	className: 'QueryAuthor',
	fields: (field) => ({
		active: field.boolean({ default: true }),
		name: field.string({ required: true }),
		posts: field.relation({ mappedBy: 'author', target: 'QueryPost' }),
	}),
})

export const Comment = Schema.define({
	className: 'QueryComment',
	fields: (field) => ({
		body: field.string({ required: true }),
		published: field.boolean({ default: false }),
	}),
})

export const Post = Schema.define({
	className: 'QueryPost',
	fields: (field) => ({
		author: field.pointer({ required: true, target: 'QueryAuthor' }),
		comments: field.relation({ target: 'QueryComment' }),
		internalNote: field.string(),
		published: field.boolean({ default: false }),
		score: field.int({ default: 0 }),
		tags: field.string({ default: [], list: true }),
		title: field.string({ required: true }),
		views: field.int({ default: 0 }),
	}),
})
