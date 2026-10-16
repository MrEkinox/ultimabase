//#region application
import { MasterAuthority } from '@ultimabase/core'

import { App } from './app.ts'
import { readSecret } from './env.ts'
import { Link } from './schema.ts'

export const ultimabase = new App({
	// `httpPlugin({ master: true })` hands the header to this authority.
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'operations', value: readSecret('ULTIMABASE_MASTER_KEY') }],
		onUse: (event) => {
			// Replace this console record with a durable audit sink in production.
			console.info('Master authority used', event.reason)
		},
	}),
	schemas: [Link],
})

// One declaration per application gives name-keyed editor types.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
