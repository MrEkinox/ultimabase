import process from 'node:process'

import { includeAdministratorsInEditors } from './staff.ts'
import { ultimabase } from './ultimabase.ts'

//#region start
// start() creates the `ensure` roles; leaving this scope disposes the app.
await using app = await ultimabase.start()
// The hierarchy is data: trusted server code links the roles once started.
await includeAdministratorsInEditors()
//#endregion start

process.stdout.write(
	`Roles example ${app.state}: REST on http://127.0.0.1:1337/api/classes/StaffRole\n`,
)

// Keep framework-owned resources until the development process stops.
await new Promise<void>((resolve) => {
	process.once('SIGINT', () => {
		resolve()
	})
	process.once('SIGTERM', () => {
		resolve()
	})
})
