import process from 'node:process'

import { includeAdministratorsInEditors } from './staff.ts'
import { ultimabase } from './ultimabase.ts'

//#region start
// start() creates the `ensure` roles; leaving this scope disposes it.
await using started = await ultimabase.start()
// The hierarchy is data: trusted server code links the roles once started.
await includeAdministratorsInEditors()
//#endregion start

process.stdout.write(
	`Roles example ${started.state}: REST on http://127.0.0.1:1337/api/classes/StaffRole\n`,
)

// The server plugin stops the application on SIGINT or SIGTERM; leaving
// this scope then disposes it.
await started.closed
