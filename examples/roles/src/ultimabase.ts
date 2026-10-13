//#region application
import process from 'node:process'

import { MasterAuthority } from '@ultimabase/core'

import { App, Member, Post, StaffRole, Team } from './schema.ts'

const masterKey = process.env.ULTIMABASE_MASTER_KEY
if (masterKey === undefined || masterKey === '') {
	throw new TypeError('Set ULTIMABASE_MASTER_KEY to a private random value')
}

/** Staff administration runs with audited Master authority. */
export const ultimabase = new App({
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'roles-example', value: masterKey }],
		onUse: (event) => {
			// Replace this console record with a durable audit sink in production.
			console.info('Master authority used', event.reason)
		},
	}),
	schemas: [Member, StaffRole, Team, Post],
})

// One declaration per application gives name-keyed editor types (ADR-0297).
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
