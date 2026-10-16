//#region application
import { App } from './app.ts'
import { Member, Note } from './schema.ts'

export const ultimabase = new App({ schemas: [Member, Note] })

// One declaration per application gives name-keyed editor types.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
