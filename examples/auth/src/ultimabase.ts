//#region application
import { App, Member, Note } from './schema.ts'

export const ultimabase = new App({ schemas: [Member, Note] })

// One declaration per application gives name-keyed editor types (ADR-0297).
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
