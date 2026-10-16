import { rulesPlugin } from './rules-plugin.ts'
import { App, Author, Post } from './schema.ts'

export const ultimabase = new (App.use(rulesPlugin))({
	schemas: [Author, Post],
})

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
