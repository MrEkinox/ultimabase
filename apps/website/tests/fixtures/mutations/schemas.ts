import { Schema } from '@ultimabase/core'

export const Account = Schema.define({
	className: 'MutationAccount',
	fields: (field) => ({
		displayName: field.string({ required: true }),
		email: field.string({ indexed: 'unique', required: true }),
	}),
})

export const Comment = Schema.define({
	className: 'MutationComment',
	fields: (field) => ({
		body: field.string({ required: true }),
	}),
})

export const Post = Schema.define({
	className: 'MutationPost',
	fields: (field) => ({
		author: field.pointer({ required: true, target: 'MutationAccount' }),
		comments: field.relation({ target: 'MutationComment' }),
		slug: field.string({ indexed: 'unique', required: true }),
		summary: field.string(),
		title: field.string({ required: true }),
		views: field.int({ default: 0 }),
	}),
	softDelete: 'explicit',
})
