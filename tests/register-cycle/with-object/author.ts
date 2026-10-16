import { App } from './app.ts'
import { Post } from './post.ts'

export const Author = App.Schema.define({
	className: 'Author',
	fields: (field) => ({
		name: field.string({ required: true }),
		email: field.string({ required: true }),
		posts: field.relation({ target: () => Post, mappedBy: 'author' }),
	}),
}).with({
	access: {
		// Author -> Post filter (relation mappedBy), destructured parameters
		read: ({ where }) =>
			where.some('posts', (post) => post.eq('published', true)),
		create: true,
	},
	hooks: {
		beforeOperation: {
			update: ({ item }) => {
				if (item.name.trim() === '') throw new TypeError('empty name')
			},
		},
	},
	relations: { posts: { where: ({ where }) => where.eq('published', true) } },
	rest: { findMany: true },
	postgres: { table: 'spike_authors' },
})
