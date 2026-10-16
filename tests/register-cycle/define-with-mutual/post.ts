import { App } from './app.ts'
import { Author } from './author.ts'
import { Comment } from './comment.ts'

export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		published: field.boolean({ required: true, default: false }),
		author: field.pointer({ target: () => Author }),
		fans: field.relation({ target: () => Author, mappedBy: 'favorite' }),
		comments: field.relation({ target: () => Comment, mappedBy: 'post' }),
	}),
	softDelete: true,
}).with({
	relations: {
		fans: {
			where: ({ where }) =>
				where.some('posts', (post) => post.eq('published', true)),
		},
		comments: { where: { body: { eq: 'x' } } },
	},
	access: {
		read: ({ where }) => where.eq('published', true),
		update: ({ where }) =>
			where.is('author', (author) => author.endsWith('email', '@admin.test')),
		softDeleteOne: true,
		restoreOne: ({ where }) =>
			where.some('comments', (comment) => comment.eq('body', 'ok')),
	},
	hooks: {
		beforeOperation: {
			update: async ({ item }) => {
				const author = await Author.findOne({ where: { id: { eq: 'a' } } })
				if (item.isDeleted || author?.name === '') throw new TypeError('x')
			},
		},
	},
	rest: { softDeleteOne: true, restoreOne: true },
})
