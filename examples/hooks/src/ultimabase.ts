//#region application
import { App } from './app.ts'
import { postRulesPlugin } from './post-rules-plugin.ts'
import { Author, Comment, Post, PostTitleChange, Tag } from './schema.ts'

/** The contributing plugin targets Post, so it joins once Post exists. */
export const ultimabase = new (App.use(postRulesPlugin))({
	schemas: [Author, Tag, Post, PostTitleChange, Comment],
})

// One declaration per application gives name-keyed editor types (ADR-0297).
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
