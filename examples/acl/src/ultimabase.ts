//#region application
import { MasterAuthority } from '@ultimabase/core'

import { App } from './app.ts'
import { aclAuditPlugin } from './acl-audit-plugin.ts'
import { Announcement, Member, Note, Page, Team } from './schema.ts'

/** The administration helpers run with audited Master authority. */
export const ultimabase = new (App.use(aclAuditPlugin))({
	masterAuthority: new MasterAuthority({
		onUse: (event) => {
			// Replace this console record with a durable audit sink in production.
			console.info('Master authority used', event.reason)
		},
	}),
	schemas: [Member, Team, Note, Announcement, Page],
})

// One declaration per application gives name-keyed editor types.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
