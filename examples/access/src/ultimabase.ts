//#region application
import { Article, Story, Subscriber } from './articles.ts'
import { Comment } from './comments.ts'
import { AuditEntry, Note } from './notes.ts'
import { Draft } from './openings.ts'
import { Profile } from './profiles.ts'
import { App, Member, StaffRole } from './schema.ts'

export const ultimabase = new App({
	schemas: [
		Member,
		StaffRole,
		Article,
		Subscriber,
		Story,
		Note,
		AuditEntry,
		Profile,
		Comment,
		Draft,
	],
})

// One declaration per application gives name-keyed editor types (ADR-0297).
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
