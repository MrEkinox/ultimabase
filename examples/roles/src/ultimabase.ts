//#region application
import { MasterAuthority } from '@ultimabase/core'

import { App } from './app.ts'
import { Member, Post, StaffRole, Team } from './schema.ts'

/** Staff administration runs with audited Master authority. */
export const ultimabase = new App({
	masterAuthority: new MasterAuthority({
		onUse: (event) => {
			// Replace this console record with a durable audit sink in production.
			console.info('Master authority used', event.reason)
		},
	}),
	schemas: [Member, StaffRole, Team, Post],
})

// One declaration per application gives name-keyed editor types.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
