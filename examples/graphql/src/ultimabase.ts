//#region application
import { App, AuditEntry, Author, Comment, Feedback, Post } from './schema.ts'

export const ultimabase = new App({
	schemas: [Author, Comment, Post, Feedback, AuditEntry],
})

// One declaration per application gives name-keyed editor types (ADR-0297).
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
