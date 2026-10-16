//#region application
import { App } from './app.ts'
import { Article, Contribution, StaffMember, Tag } from './schema.ts'

/** Creating the application does not contact PostgreSQL; `start()` does. */
export const ultimabase = new App({
	schemas: [StaffMember, Tag, Article, Contribution],
})

// One declaration per application gives name-keyed editor types.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
