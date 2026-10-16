import { App } from './app.ts'
import { Post } from './post.ts'

export const Comment = App.Schema.define({
	className: 'Comment',
	fields: (field) => ({
		body: field.string({ required: true }),
		post: field.pointer({ target: () => Post }),
		parent: field.pointer({ target: () => Comment }),
		replies: field.relation({ target: () => Comment, mappedBy: 'parent' }),
	}),
	softDelete: { mode: 'command' },
	indexes: [
		{ fields: ['post', 'body'], unique: true, where: { isDeleted: false } },
	],
}).with((plugins) =>
	plugins
		.relations({
			replies: {
				where: ({ where }) =>
					where.is('post', (post) => post.eq('published', true)),
			},
		})
		.access({
			read: ({ where }) =>
				where.is('parent', (parent) => parent.eq('body', 'root')),
		}),
)
