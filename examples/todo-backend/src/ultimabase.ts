import { MasterAuthority } from '@ultimabase/core'

import { App } from './app.ts'
import { Todo, TodoRole, TodoUser } from './schema.ts'

/**
 * The Todo application. Administrative code (`admin.ts`, `todos.ts`) runs
 * with `useMasterKey`; `start()` connects PostgreSQL from `DATABASE_URL`.
 */
export const ultimabase = new App({
	masterAuthority: new MasterAuthority({
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
