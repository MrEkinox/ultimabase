//#region application
import { App } from './app.ts'
import { Author, Feedback, Post, Tag } from './schema.ts'

export const ultimabase = new App({ schemas: [Author, Tag, Post, Feedback] })

// One declaration per application gives name-keyed editor types (ADR-0297).
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
