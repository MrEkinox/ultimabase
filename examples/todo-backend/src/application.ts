import process from 'node:process'

import { MasterAuthority } from '@ultimabase/core'

import { App, Todo, TodoRole, TodoUser } from './schema.ts'

const masterKey = process.env.ULTIMABASE_MASTER_KEY
if (masterKey === undefined || masterKey === '') {
	throw new TypeError('Set ULTIMABASE_MASTER_KEY to a private random value')
}

/**
 * The Todo application. Administrative code (`admin.ts`, `todos.ts`) runs
 * with `useMasterKey`; `start()` connects PostgreSQL from `DATABASE_URL`.
 */
//#region application
export const ultimabase = new App({
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'todo-backend', value: masterKey }],
		onUse: (event) => {
			// Replace this console record with a durable audit sink in production.
			console.info('Master authority used', {
				kind: event.kind,
				reason: event.reason,
				requestId: event.requestId,
			})
		},
	}),
	schemas: [TodoUser, TodoRole, Todo],
})

// One declaration per application gives name-keyed editor types.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
