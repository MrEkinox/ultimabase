import { allow, enumOf, many, one, string } from '../index.ts'
import { App } from './app.ts'
import { Post } from './post.ts'

export const User = App.defineModel({
	name: 'User',
	fields: {
		email: string({ unique: true }).with({
			access: { read: ({ caller, record }) => caller.user?.id === record.id },
		}),
		role: enumOf(['reader', 'editor'], { default: 'reader' }),
		posts: many(() => Post, { inverse: 'author' }),
		reviewed: many(() => Post, { inverse: 'reviewer' }),
		manager: one(() => User, { optional: true }),
	},
}).with({ access: allow.public })
