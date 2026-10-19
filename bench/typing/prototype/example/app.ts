import { createApp } from '../index.ts'
import { Post } from './post.ts'
import { Tag } from './tag.ts'
import { User } from './user.ts'

export const app = createApp({ models: [Post, User, Tag] })

declare module '../register.ts' {
	interface Register {
		readonly app: typeof app
	}
}
