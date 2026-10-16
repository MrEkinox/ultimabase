import type { ACL } from '@ultimabase/acl-permissions-plugin'
import { App } from './app.ts'
import { Post } from './post.ts'

export const Author = App.Schema.define({
	className: 'Author',
	fields: (field) => ({
		name: field.string({ required: true }),
		email: field.string({ required: true }),
		posts: field.relation({ target: () => Post, mappedBy: 'author' }),
		favorite: field.pointer({ target: () => Post }),
	}),
	acl: true,
}).with((plugins) =>
	plugins
		.acl({
			default: ({ data }) =>
				data.name === '' ? defaultAcl() : defaultAcl().grantPublic('read'),
		})
		.access({
			read: ({ where }) =>
				where.some('posts', (post) => post.eq('published', true)),
			update: ({ where }) =>
				where.is('favorite', (post) => post.eq('isDeleted', false)),
		})
		.relations({
			posts: {
				where: ({ where }) =>
					where.is('author', (author) => author.eq('name', 'x')),
			},
		}),
)

declare function defaultAcl(): ACL
