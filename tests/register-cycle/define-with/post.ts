import { ACL } from '@ultimabase/acl-permissions-plugin'
import { App } from './app.ts'
import { Author } from './author.ts'

export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		slug: field.string({ required: true }),
		published: field.boolean({ required: true, default: false }),
		author: field.pointer({ target: () => Author }),
	}),
	softDelete: { mode: 'command' },
	acl: true,
	indexes: [
		{ fields: ['author', 'slug'], unique: true },
		{ fields: ['slug'], unique: true, where: { isDeleted: false } },
	],
}).with((plugins) =>
	plugins
		.acl({
			default: ({ principal }) => new ACL(principal),
			limits: { maxPrincipals: 3 },
		})
		.access({
			read: ({ where }) => where.eq('published', true),
			// Post -> Author filter (pointer)
			update: ({ where }) =>
				where.is('author', (author) => author.endsWith('email', '@admin.test')),
			softDeleteOne: true,
		})
		.hooks({
			beforeOperation: {
				update: ({ item }) => {
					if (item.isDeleted) throw new TypeError('Deleted posts are read-only')
				},
			},
		})
		.rest({ softDeleteOne: true })
		.graphql({ softDeleteOne: true })
		.postgres({ table: 'spike_posts' }),
)
