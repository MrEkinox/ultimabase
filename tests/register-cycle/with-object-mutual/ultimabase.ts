import { App } from './app.ts'
import { Author } from './author.ts'
import { Comment } from './comment.ts'
import { Post } from './post.ts'

export const ultimabase = new App({ schemas: [Author, Post, Comment] })

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
