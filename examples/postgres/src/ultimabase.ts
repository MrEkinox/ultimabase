//#region application
import { App, Article, Contribution, StaffMember, Tag } from './schema.ts'

/** Creating the application does not contact PostgreSQL; `start()` does. */
export const ultimabase = new App({
	schemas: [StaffMember, Tag, Article, Contribution],
})

// One declaration per application gives name-keyed editor types (ADR-0297).
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
