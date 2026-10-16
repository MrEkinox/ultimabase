import { App } from './app.ts'
import { Author } from './author.ts'
import { Post } from './post.ts'

export const ultimabase = new App({ schemas: [Author, Post] })

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
