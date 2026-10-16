//#region application
import process from 'node:process'

import { MasterAuthority } from '@ultimabase/core'

import { App } from './app.ts'
import { Announcement, Author, Comment, Post, Translation } from './schema.ts'

const masterKey = process.env.ULTIMABASE_MASTER_KEY
if (masterKey === undefined || masterKey === '') {
	throw new TypeError('Set ULTIMABASE_MASTER_KEY to a private random value')
}

/** Trusted server code may use Master; every use is audited first. */
export const ultimabase = new App({
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'maintenance', value: masterKey }],
		onUse: (event) => {
			// Replace this console record with a durable audit sink in production.
			console.info('Master use', {
				keyId: event.keyId,
				reason: event.reason,
				requestId: event.requestId,
			})
		},
	}),
	schemas: [Author, Post, Comment, Translation, Announcement],
})
//#endregion application

//#region register
// One declaration per application gives name-keyed editor types;
// `principal` names the schema a request principal points to.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
		readonly principal: 'Author'
	}
}
//#endregion register
