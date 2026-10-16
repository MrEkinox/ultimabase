//#region application
import { Draft } from './openings.ts'
import {
	App,
	Article,
	AuditEntry,
	Comment,
	Member,
	Note,
	Profile,
	StaffRole,
	Story,
	Subscriber,
} from './schema.ts'

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

// One declaration per application gives name-keyed editor types.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
